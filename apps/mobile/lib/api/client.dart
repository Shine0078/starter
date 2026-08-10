import 'dart:convert';
import 'dart:async';

import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart';

import '../models/models.dart';
import 'offline_cache.dart';
import 'session_store.dart';

/// Where the API lives, for this build on this platform.
///
/// Set `--dart-define=API_BASE_URL=https://api.example.com` for a deployed
/// build. Physical phones must use an explicitly configured HTTPS origin.
///
/// Left unset, the two defaults differ because the right answer does:
///
///  - **Web.** The compiled app is served by the API itself, so the API is
///    wherever the page came from.
///  - **Native.** `10.0.2.2` is the Android emulator's alias for the host
///    machine; `localhost` inside the emulator is the emulator itself.
String resolveBaseUrl() {
  const configured = String.fromEnvironment('API_BASE_URL');
  if (kReleaseMode && !kIsWeb && configured.isEmpty) {
    throw ArgumentError(
      'API_BASE_URL must be supplied for a native release build. '
      'Use a public HTTPS API origin.',
    );
  }
  final raw = configured.isNotEmpty
      ? configured
      : kIsWeb
          ? Uri.base.origin
          : defaultTargetPlatform == TargetPlatform.android
              ? 'http://10.0.2.2:3000'
              : 'http://127.0.0.1:3000';
  return normalizeBaseUrl(raw);
}

/// Validates and canonicalises an API origin before it is used to construct a
/// request. A trailing slash is removed so paths cannot become `//api/...`.
String normalizeBaseUrl(String raw) {
  final value = raw.trim();
  final uri = Uri.tryParse(value);
  if (uri == null ||
      uri.host.isEmpty ||
      !{'http', 'https'}.contains(uri.scheme)) {
    throw ArgumentError.value(
        raw, 'API_BASE_URL', 'must be an absolute http:// or https:// URL');
  }
  if (uri.userInfo.isNotEmpty) {
    throw ArgumentError.value(
      raw,
      'API_BASE_URL',
      'must not contain embedded credentials',
    );
  }
  final localHost =
      uri.host == 'localhost' || uri.host == '127.0.0.1' || uri.host == '::1';
  if (kReleaseMode && uri.scheme != 'https' && !localHost) {
    throw ArgumentError.value(
      raw,
      'API_BASE_URL',
      'native release builds require HTTPS',
    );
  }
  if (uri.query.isNotEmpty || uri.fragment.isNotEmpty) {
    throw ArgumentError.value(
        raw, 'API_BASE_URL', 'must not include a query string or fragment');
  }
  return value.replaceFirst(RegExp(r'/+$'), '');
}

/// Formats a calendar date without converting it through UTC. Date filters
/// represent the user's local calendar day; converting midnight to ISO UTC
/// shifts it for users east of UTC.
String dateOnly(DateTime value) {
  String twoDigits(int part) => part.toString().padLeft(2, '0');
  return '${value.year}-${twoDigits(value.month)}-${twoDigits(value.day)}';
}

/// How long any single request may take before it is treated as failed.
///
/// Applied to *every* call, including the unauthenticated ones. A request with
/// no timeout does not fail — it hangs, and a sign-in button that spins forever
/// with no error and no way back is indistinguishable from a crashed app. That
/// is the exact shape of a server whose host went to sleep mid-request: the TCP
/// connection is accepted and then nothing ever comes back.
const Duration kRequestTimeout = Duration(seconds: 20);

enum _RefreshFailure { none, unavailable, rejected }

/// Thin client over the FINVERSE API.
///
/// It parses JSON into models but contains no financial business logic. The
/// financial rules live server-side in the domain layer
/// (see ADR-0002) so that the phone and any future web client cannot drift
/// apart in their arithmetic.
///
/// It does own one piece of protocol: attaching the access token and, when the
/// server says it has expired, exchanging the refresh token exactly once before
/// retrying. Access tokens are short-lived, so without that every screen would
/// have to handle a 401 itself.
class ApiClient {
  ApiClient(
      {http.Client? httpClient,
      String? baseUrl,
      SessionStore? sessionStore,
      OfflineCacheStore? offlineCache})
      : _http = httpClient ?? http.Client(),
        sessionStore = sessionStore ?? SecureSessionStore(),
        offlineCache = offlineCache ?? NoopOfflineCacheStore(),
        baseUrl = baseUrl ?? resolveBaseUrl();

  final http.Client _http;
  final String baseUrl;
  final SessionStore sessionStore;
  final OfflineCacheStore offlineCache;

  SessionTokens? _tokens;
  Future<bool>? _refreshFuture;
  _RefreshFailure _lastRefreshFailure = _RefreshFailure.none;
  final ValueNotifier<DateTime?> offlineCacheStatus = ValueNotifier(null);

  /// Monotonically increasing revision for successful authenticated writes.
  ///
  /// Screens in the IndexedStack stay alive while the user moves between
  /// tabs. Broadcasting a revision lets them invalidate their reads as soon
  /// as a bank sync, categorisation, budget, or goal mutation completes,
  /// without coupling the API client to a state-management package.
  final ValueNotifier<int> dataRevision = ValueNotifier(0);

  DateTime? get offlineCacheUpdatedAt => offlineCacheStatus.value;
  bool get usedOfflineCache => offlineCacheStatus.value != null;
  void resetOfflineStatus() => offlineCacheStatus.value = null;

  /// Called when the session is gone for good, so the app can show sign-in.
  void Function()? onSessionExpired;

  Uri _uri(String path) => Uri.parse('$baseUrl/api$path');

  /// True when a stored session was found. Call once at startup.
  Future<bool> restoreSession() async {
    _tokens = await sessionStore.read();
    final stored = _tokens;
    if (stored == null) return false;

    // Do not let an already-expired refresh token create a confusing loop of
    // failed API calls. The server remains authoritative, but the timestamp
    // lets us clear an obviously dead local session before rendering the app.
    final refreshExpiry = stored.refreshExpiresAt.isEmpty
        ? null
        : DateTime.tryParse(stored.refreshExpiresAt);
    if (refreshExpiry != null && !refreshExpiry.isAfter(DateTime.now())) {
      await signOut(notifyServer: false);
      return false;
    }

    // A user who leaves the app for more than the short access-token lifetime
    // should return directly to a refreshed session, not to a dashboard that
    // flashes errors while its first batch of requests discovers the expiry.
    if (_accessTokenExpired(stored.accessToken) && !await _refresh()) {
      // A network outage should leave a valid refresh credential in place so
      // the offline cache can still render and the next resume can retry. Only
      // an authoritative 4xx/revocation response justifies signing out.
      if (_lastRefreshFailure == _RefreshFailure.rejected) {
        await signOut(notifyServer: false);
        return false;
      }
    }
    return _tokens != null;
  }

  bool get isAuthenticated => _tokens != null;

  bool _accessTokenExpired(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return false;
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      ) as Map<String, dynamic>;
      final exp = payload['exp'];
      return exp is num &&
          (DateTime.now().millisecondsSinceEpoch ~/ 1000) >= exp.toInt();
    } catch (_) {
      // Test doubles and older tokens may not be JWTs. Let the API decide in
      // that case; a malformed local value is not evidence that the session is
      // expired.
      return false;
    }
  }

  Map<String, String> _headers({bool json = false}) => {
        if (json) 'content-type': 'application/json',
        if (_tokens != null) 'authorization': 'Bearer ${_tokens!.accessToken}',
      };

  Future<http.Response> _perform(
    String method,
    String path,
    Object? body,
    bool allowRetry,
  ) async {
    final request = http.Request(method, _uri(path))
      ..headers.addAll(_headers(json: body != null));
    if (body != null) request.body = jsonEncode(body);

    final response = await http.Response.fromStream(
      await _http.send(request).timeout(kRequestTimeout),
    );

    if (response.statusCode == 401 && allowRetry && _tokens != null) {
      if (await _refresh()) return _perform(method, path, body, false);
      if (_lastRefreshFailure == _RefreshFailure.rejected) {
        await signOut(notifyServer: false);
        onSessionExpired?.call();
      }
    }

    return response;
  }

  Future<dynamic> _get(String path) async {
    final owner = _cacheOwner;
    try {
      final response = await _perform('GET', path, null, true);
      if (response.statusCode >= 400) {
        if (response.statusCode < 500) {
          throw PlanUpgradeRequiredException.maybeFrom(path, response) ??
              ApiException(path, response.statusCode, response.body);
        }
        return _cachedOrThrow(owner, path,
            ApiException(path, response.statusCode, response.body));
      }
      if (owner != null && response.body.isNotEmpty && !_neverCache(path)) {
        try {
          await offlineCache.write(owner, path, response.body);
        } catch (_) {
          // A cache failure must never turn a successful API read into an error.
        }
      }
      return jsonDecode(response.body);
    } on PlanUpgradeRequiredException {
      // Not a network failure, so serving stale cache would be wrong: the
      // server has answered, and its answer is "upgrade".
      rethrow;
    } on ApiException {
      rethrow;
    } on TimeoutException catch (error) {
      return _cachedOrThrow(owner, path, error);
    } on http.ClientException catch (error) {
      return _cachedOrThrow(owner, path, error);
    }
  }

  Future<dynamic> _cachedOrThrow(
      String? owner, String path, Object original) async {
    if (owner != null && !_neverCache(path)) {
      try {
        final cached = await offlineCache.read(owner, path);
        if (cached != null) {
          final current = offlineCacheStatus.value;
          offlineCacheStatus.value =
              current == null || cached.updatedAt.isBefore(current)
                  ? cached.updatedAt
                  : current;
          return jsonDecode(cached.body);
        }
      } catch (_) {
        // Preserve the network error; corrupt or unavailable cache is not data.
      }
    }
    throw original;
  }

  bool _neverCache(String path) => path.startsWith('/auth/');

  String? get _cacheOwner {
    if (_tokens?.userId != null) return _tokens!.userId;
    final token = _tokens?.accessToken;
    if (token == null) return null;
    try {
      final parts = token.split('.');
      if (parts.length != 3) return null;
      final payload = jsonDecode(
              utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))))
          as Map<String, dynamic>;
      return payload['sub'] as String?;
    } catch (_) {
      return null;
    }
  }

  Future<dynamic> _send(String method, String path, [Object? body]) async {
    final response = await _perform(method, path, body, true);
    if (response.statusCode >= 400) {
      throw PlanUpgradeRequiredException.maybeFrom(path, response) ??
          ApiException(path, response.statusCode, response.body);
    }
    // Auth endpoints have their own response/session lifecycle. All other
    // successful writes can change data that an already-mounted screen reads.
    if (!path.startsWith('/auth/')) dataRevision.value++;
    return response.body.isEmpty ? null : jsonDecode(response.body);
  }

  // ------------------------------------------------------------------ auth

  Future<LegalPolicies> legalPolicies() async {
    final response = await _http.get(_uri('/legal')).timeout(kRequestTimeout);
    if (response.statusCode >= 400) {
      throw ApiException('/legal', response.statusCode, response.body);
    }
    return LegalPolicies.fromJson(
        jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<PublicUser> register(
    String email,
    String password, {
    required LegalPolicies policies,
    required bool acceptedTerms,
    required bool acceptedPrivacyNotice,
  }) {
    final body = <String, dynamic>{'email': email, 'password': password};
    if (policies.registrationRequired) {
      body.addAll({
        'acceptedTerms': acceptedTerms,
        'termsVersion': policies.terms!.version,
        'acceptedPrivacyNotice': acceptedPrivacyNotice,
        'privacyVersion': policies.privacyNotice!.version,
      });
    }
    return _authenticate('/auth/register', body);
  }

  Future<PublicUser> signIn(String email, String password) =>
      _authenticate('/auth/login', {'email': email, 'password': password});

  Future<PublicUser> verifyMfa(String challengeToken, String code) =>
      _authenticate('/auth/mfa/verify', {
        'challengeToken': challengeToken,
        'code': code,
      });

  Future<MfaStatus> mfaStatus() async =>
      MfaStatus.fromJson(await _get('/auth/mfa') as Map<String, dynamic>);

  Future<MfaEnrollment> enrollMfa(String password) async =>
      MfaEnrollment.fromJson(await _authSend(
        'POST',
        '/auth/mfa/enroll',
        {'password': password},
      ) as Map<String, dynamic>);

  Future<List<String>> enableMfa(String code) async {
    final json = await _authSend('POST', '/auth/mfa/enable', {'code': code})
        as Map<String, dynamic>;
    return (json['recoveryCodes'] as List<dynamic>).cast<String>();
  }

  Future<void> disableMfa(String password, String code) async {
    await _authSend(
        'DELETE', '/auth/mfa', {'password': password, 'code': code});
  }

  Future<dynamic> _authSend(String method, String path, Object body) async {
    final response = await _perform(method, path, body, true);
    final decoded = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw AuthException.fromResponse(response.statusCode, decoded);
    }
    return decoded;
  }

  Future<PublicUser> cancelAccountDeletion(String email, String password) =>
      _authenticate(
        '/auth/cancel-deletion',
        {'email': email, 'password': password},
      );

  Future<void> requestPasswordReset(String email) =>
      _publicAuthAction('/auth/password-reset/request', {'email': email});

  Future<void> confirmPasswordReset(String token, String password) =>
      _publicAuthAction(
        '/auth/password-reset/confirm',
        {'token': token, 'password': password},
      );

  Future<void> confirmEmailVerification(String token) => _publicAuthAction(
        '/auth/email-verification/confirm',
        {'token': token},
      );

  Future<void> requestEmailVerification() async {
    await _send('POST', '/auth/email-verification/request');
  }

  Future<void> _publicAuthAction(String path, Map<String, dynamic> body) async {
    final response = await _http
        .post(
          _uri(path),
          headers: {'content-type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(kRequestTimeout);
    final decoded = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw AuthException.fromResponse(response.statusCode, decoded);
    }
  }

  Future<PublicUser> _authenticate(
      String path, Map<String, dynamic> body) async {
    // Deliberately bypasses _perform: there is no session to attach or retry.
    final response = await _http
        .post(
          _uri(path),
          headers: {'content-type': 'application/json'},
          body: jsonEncode(body),
        )
        .timeout(kRequestTimeout);

    final decoded = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode >= 400) {
      throw AuthException.fromResponse(response.statusCode, decoded);
    }

    if (decoded['mfaRequired'] == true) {
      throw MfaRequiredException(
        decoded['challengeToken'] as String,
        DateTime.parse(decoded['expiresAt'] as String),
      );
    }

    final user = PublicUser.fromJson(decoded['user'] as Map<String, dynamic>);
    _tokens = SessionTokens.fromJson(decoded['tokens'] as Map<String, dynamic>)
        .withUserId(user.id);
    await sessionStore.write(_tokens!);
    return user;
  }

  /// Share one refresh-token rotation across parallel requests. The dashboard
  /// loads resources concurrently; rotating the same token twice would look
  /// like token reuse and revoke the whole session family.
  Future<bool> _refresh() {
    final existing = _refreshFuture;
    if (existing != null) return existing;
    final future = _refreshInternal();
    _refreshFuture = future;
    future.whenComplete(() {
      if (identical(_refreshFuture, future)) _refreshFuture = null;
    });
    return future;
  }

  Future<bool> _refreshInternal() async {
    final refreshToken = _tokens?.refreshToken;
    if (refreshToken == null) return false;

    _lastRefreshFailure = _RefreshFailure.none;

    try {
      final response = await _http
          .post(
            _uri('/auth/refresh'),
            headers: {'content-type': 'application/json'},
            body: jsonEncode({'refreshToken': refreshToken}),
          )
          .timeout(kRequestTimeout);
      if (response.statusCode >= 500) {
        _lastRefreshFailure = _RefreshFailure.unavailable;
        return false;
      }
      if (response.statusCode >= 400) {
        _lastRefreshFailure = _RefreshFailure.rejected;
        return false;
      }

      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      // A sign-out can happen while the request is in flight. Never resurrect
      // that local session with a late refresh response.
      if (_tokens?.refreshToken != refreshToken) return false;
      final userId = _cacheOwner;
      _tokens =
          SessionTokens.fromJson(decoded['tokens'] as Map<String, dynamic>)
              .withUserId(userId);
      await sessionStore.write(_tokens!);
      return true;
    } on TimeoutException {
      _lastRefreshFailure = _RefreshFailure.unavailable;
      return false;
    } on http.ClientException {
      _lastRefreshFailure = _RefreshFailure.unavailable;
      return false;
    } catch (_) {
      _lastRefreshFailure = _RefreshFailure.rejected;
      return false;
    }
  }

  Future<PublicUser> me() async =>
      PublicUser.fromJson(await _get('/auth/me') as Map<String, dynamic>);

  Future<List<AppSession>> sessions() async {
    final json = await _get('/auth/sessions') as List<dynamic>;
    return json
        .map((e) => AppSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> revokeSession(String sessionId) async {
    await _send('DELETE', '/auth/sessions/${Uri.encodeComponent(sessionId)}');
  }

  Future<void> signOutEverywhere() async {
    final owner = _cacheOwner;
    await _send('POST', '/auth/logout-all');
    _tokens = null;
    await sessionStore.clear();
    if (owner != null) await offlineCache.clearOwner(owner);
  }

  /// Clears the local session, and by default tells the server to revoke it.
  ///
  /// The local clear happens regardless of whether the server call succeeds —
  /// a user tapping "sign out" on a train with no signal must still end up
  /// signed out on the device.
  Future<void> signOut({bool notifyServer = true}) async {
    final owner = _cacheOwner;
    if (notifyServer && _tokens != null) {
      try {
        await _perform('POST', '/auth/logout', null, false);
      } catch (_) {
        // Offline, or the session was already revoked server-side.
      }
    }
    _tokens = null;
    await sessionStore.clear();
    if (owner != null) await offlineCache.clearOwner(owner);
  }

  /// Schedules irreversible erasure after a 30-day recovery window.
  /// Credentials are cleared only after the server accepts the request.
  Future<DateTime> requestAccountDeletion(String password) async {
    final owner = _cacheOwner;
    final response = await _perform(
      'DELETE',
      '/auth/account',
      {'password': password, 'confirmation': 'DELETE'},
      true,
    );
    final decoded = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400) {
      throw AuthException.fromResponse(response.statusCode, decoded);
    }

    final scheduledFor = DateTime.parse(decoded['purgeScheduledFor'] as String);
    _tokens = null;
    await sessionStore.clear();
    if (owner != null) await offlineCache.clearOwner(owner);
    return scheduledFor;
  }

  Future<String> exportData(String password) async {
    final response = await _perform(
      'POST',
      '/privacy/export',
      {'password': password},
      true,
    );
    if (response.statusCode >= 400) {
      final decoded = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body) as Map<String, dynamic>;
      throw AuthException.fromResponse(response.statusCode, decoded);
    }
    return response.body;
  }

  Future<List<int>> monthlyReportPdf() async {
    final response = await _perform('GET', '/reports/monthly.pdf', null, true);
    if (response.statusCode >= 400) {
      throw ApiException(
          '/reports/monthly.pdf', response.statusCode, response.body);
    }
    return response.bodyBytes;
  }

  Future<PrivacyDashboard> privacyDashboard() async {
    final json = await _get('/privacy') as Map<String, dynamic>;
    return PrivacyDashboard.fromJson(json);
  }

  Future<PrivacyDashboard> updateConsent(String kind, bool granted) async {
    final json = await _send(
      'PATCH',
      '/privacy/consents/${Uri.encodeComponent(kind)}',
      {'granted': granted},
    ) as Map<String, dynamic>;
    return PrivacyDashboard.fromJson(json);
  }

  Future<SyncResult> sync() async {
    final json = await _send('POST', '/sync') as Map<String, dynamic>;
    return SyncResult.fromJson(json);
  }

  Future<List<Account>> accounts() async {
    final json = await _get('/accounts') as List<dynamic>;
    return json
        .map((e) => Account.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Account> createManualAccount({
    required String name,
    required String type,
    required String currency,
    required int balanceCurrent,
  }) async {
    final json = await _send('POST', '/accounts/manual', {
      'name': name,
      'type': type,
      'currency': currency,
      'balanceCurrent': balanceCurrent,
    }) as Map<String, dynamic>;
    return Account.fromJson(json);
  }

  Future<Account> updateManualAccount(
    String id, {
    required String name,
    required String type,
    required String currency,
    required int balanceCurrent,
  }) async {
    final json = await _send(
      'PATCH',
      '/accounts/manual/${Uri.encodeComponent(id)}',
      {
        'name': name,
        'type': type,
        'currency': currency,
        'balanceCurrent': balanceCurrent,
      },
    ) as Map<String, dynamic>;
    return Account.fromJson(json);
  }

  Future<void> deleteManualAccount(String id) async {
    await _send('DELETE', '/accounts/manual/${Uri.encodeComponent(id)}');
  }

  Future<CashFlowForecast> cashFlowForecast({
    required int days,
    required String currency,
  }) async {
    final json = await _get(
      '/cash-flow-forecast?days=$days&currency=${Uri.encodeQueryComponent(currency)}',
    ) as Map<String, dynamic>;
    return CashFlowForecast.fromJson(json);
  }

  Future<PurchaseScenario> purchaseScenario({
    required int amount,
    required String date,
    required int days,
    required String currency,
  }) async {
    final json = await _get(
      '/purchase-scenario?amount=$amount&date=${Uri.encodeQueryComponent(date)}&days=$days&currency=${Uri.encodeQueryComponent(currency)}',
    ) as Map<String, dynamic>;
    return PurchaseScenario.fromJson(json);
  }

  Future<List<Transaction>> transactions(
      {int limit = 50,
      String? search,
      String? before,
      String? accountId,
      String? categorySlug,
      String? categoryKind,
      bool? pending,
      bool? recurring,
      int? amountMin,
      int? amountMax,
      DateTime? from,
      DateTime? to}) async {
    final page = await transactionsPage(
      limit: limit,
      search: search,
      before: before,
      accountId: accountId,
      categorySlug: categorySlug,
      categoryKind: categoryKind,
      pending: pending,
      recurring: recurring,
      amountMin: amountMin,
      amountMax: amountMax,
      from: from,
      to: to,
    );
    return page.transactions;
  }

  Future<TransactionPage> transactionsPage(
      {int limit = 50,
      String? search,
      String? before,
      String? accountId,
      String? categorySlug,
      String? categoryKind,
      bool? pending,
      bool? recurring,
      int? amountMin,
      int? amountMax,
      DateTime? from,
      DateTime? to}) async {
    final params = <String, String>{'limit': '$limit'};
    void add(String key, String? value) {
      if (value != null && value.isNotEmpty) params[key] = value;
    }

    add('search', search);
    add('before', before);
    add('account', accountId);
    add('category', categorySlug);
    add('kind', categoryKind);
    add('pending', pending?.toString());
    add('recurring', recurring?.toString());
    add('minAmount', amountMin?.toString());
    add('maxAmount', amountMax?.toString());
    add('from', from == null ? null : dateOnly(from));
    add('to', to == null ? null : dateOnly(to));
    final query = Uri(queryParameters: params).query;
    final json = await _get('/transactions?$query') as Map<String, dynamic>;
    final rows = (json['transactions'] as List<dynamic>)
        .map((e) => Transaction.fromJson(e as Map<String, dynamic>))
        .toList();
    return TransactionPage(
      transactions: rows,
      nextCursor: json['nextCursor'] as String?,
    );
  }

  Future<List<CategoryDefinition>> categories() async {
    final json = await _get('/categories') as Map<String, dynamic>;
    return (json['categories'] as List<dynamic>)
        .map((e) => CategoryDefinition.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<Transaction>> needsReview() async {
    final json =
        await _get('/transactions/needs-review') as Map<String, dynamic>;
    return (json['transactions'] as List<dynamic>)
        .map((e) => Transaction.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Recategorize a transaction. With [createRule], the server also writes a
  /// tier-1 rule and backfills every past transaction from the same merchant —
  /// the "never make the same mistake twice" guarantee (ADR-0004).
  Future<String> recategorize(
    String transactionId,
    String categorySlug, {
    bool createRule = true,
  }) async {
    final json = await _send(
      'PATCH',
      '/transactions/$transactionId/category',
      {'categorySlug': categorySlug, 'createRule': createRule},
    ) as Map<String, dynamic>;
    return json['message'] as String? ?? 'Updated.';
  }

  Future<Transaction> updateTransactionPreferences(
    String transactionId, {
    String? merchantOverride,
    String? note,
    bool? excludedFromAnalytics,
    bool? isRecurring,
    bool? duplicateReported,
  }) async {
    final body = <String, dynamic>{};
    if (merchantOverride != null) body['merchantOverride'] = merchantOverride;
    if (note != null) body['note'] = note;
    if (excludedFromAnalytics != null) {
      body['excludedFromAnalytics'] = excludedFromAnalytics;
    }
    if (isRecurring != null) body['isRecurring'] = isRecurring;
    if (duplicateReported != null) body['duplicateReported'] = duplicateReported;
    final json = await _send(
      'PATCH',
      '/transactions/$transactionId/preferences',
      body,
    ) as Map<String, dynamic>;
    return Transaction.fromJson(json['transaction'] as Map<String, dynamic>);
  }

  Future<List<BudgetProgress>> budgetProgress() async {
    final json = await _get('/budgets/progress') as Map<String, dynamic>;
    return (json['budgets'] as List<dynamic>)
        .map((e) => BudgetProgress.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Budget> createBudget(String categorySlug, int limitMinorUnits) async {
    final json = await _send('POST', '/budgets', {
      'categorySlug': categorySlug,
      // Minor units. Never send a decimal — see ADR-0003.
      'limitAmount': limitMinorUnits,
    }) as Map<String, dynamic>;
    return Budget.fromJson(json);
  }

  Future<void> deleteBudget(String budgetId) async {
    await _send('DELETE', '/budgets/$budgetId');
  }

  Future<List<GoalProgress>> goals() async {
    final json = await _get('/goals') as Map<String, dynamic>;
    return (json['goals'] as List<dynamic>)
        .map((e) => GoalProgress.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<GoalProgress> createGoal({
    required String name,
    required int targetAmount,
    int initialAmount = 0,
    String? targetDate,
  }) async {
    final json = await _send('POST', '/goals', {
      'name': name,
      'targetAmount': targetAmount,
      'initialAmount': initialAmount,
      if (targetDate != null && targetDate.isNotEmpty) 'targetDate': targetDate,
    }) as Map<String, dynamic>;
    return GoalProgress.fromJson(json);
  }

  Future<GoalProgress> addGoalContribution(String goalId, int amount) async {
    final json = await _send(
      'POST',
      '/goals/$goalId/contributions',
      {'amount': amount},
    ) as Map<String, dynamic>;
    return GoalProgress.fromJson(json);
  }

  Future<void> deleteGoal(String goalId) async {
    await _send('DELETE', '/goals/$goalId');
  }

  Future<List<BankLink>> bankLinks() async {
    final json = await _get('/bank-links') as Map<String, dynamic>;
    return (json['links'] as List<dynamic>)
        .map((row) => BankLink.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  Future<String> createBankLinkToken({
    required String password,
    String? linkId,
    String platform = 'android',
  }) async {
    final json = await _send(
      'POST',
      '/bank-links/link-token',
      {
        'password': password,
        'platform': platform,
        if (linkId != null) 'linkId': linkId,
      },
    ) as Map<String, dynamic>;
    return json['token'] as String;
  }

  Future<BankLink> exchangeBankToken({
    required String publicToken,
    required String institutionName,
    String? institutionId,
  }) async {
    final json = await _send('POST', '/bank-links/exchange', {
      'publicToken': publicToken,
      'institutionName': institutionName,
      if (institutionId != null) 'institutionId': institutionId,
    }) as Map<String, dynamic>;
    return BankLink.fromJson(json);
  }

  Future<void> syncBankLink(String linkId) async {
    await _send('POST', '/bank-links/$linkId/sync');
  }

  Future<void> disconnectBank(String linkId) async {
    await _send('DELETE', '/bank-links/$linkId');
  }

  Future<void> refreshConnectedBanks() async {
    final links = await bankLinks();
    Object? firstError;
    for (final link in links) {
      if (!link.needsReconnect && link.status != 'revoked') {
        try {
          await syncBankLink(link.id);
        } catch (error) {
          firstError ??= error;
        }
      }
    }
    if (firstError != null) throw firstError;
  }

  Future<List<FinanceNotification>> notifications() async {
    final json = await _get('/notifications') as Map<String, dynamic>;
    return (json['notifications'] as List<dynamic>)
        .map((row) => FinanceNotification.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  Future<void> markNotificationRead(String id) async {
    await _send('PATCH', '/notifications/$id/read');
  }

  Future<NotificationPreferences> notificationPreferences() async {
    final json =
        await _get('/notifications/preferences') as Map<String, dynamic>;
    return NotificationPreferences.fromJson(json);
  }

  Future<NotificationPreferences> updateNotificationPreferences(
    NotificationPreferences preferences,
  ) async {
    final json = await _send(
      'PATCH',
      '/notifications/preferences',
      preferences.toJson(),
    ) as Map<String, dynamic>;
    return NotificationPreferences.fromJson(json);
  }

  Future<HealthScore> healthScore() async {
    final json = await _get('/health-score') as Map<String, dynamic>;
    return HealthScore.fromJson(json);
  }

  Future<InsightsReport> insights() async {
    final json = await _get('/insights') as Map<String, dynamic>;
    return InsightsReport.fromJson(json);
  }

  Future<AnalyticsReport> analytics({
    String period = 'month',
    DateTime? asOf,
    DateTime? from,
    DateTime? to,
    String currency = 'USD',
  }) async {
    final params = <String, String>{
      'period': period,
      'currency': currency,
    };
    if (asOf != null) params['asOf'] = dateOnly(asOf);
    if (from != null) params['from'] = dateOnly(from);
    if (to != null) params['to'] = dateOnly(to);
    final query = Uri(queryParameters: params).query;
    return AnalyticsReport.fromJson(
      await _get('/analytics?$query') as Map<String, dynamic>,
    );
  }

  Future<SubscriptionsReport> subscriptions() async {
    final json = await _get('/subscriptions') as Map<String, dynamic>;
    return SubscriptionsReport.fromJson(json);
  }

  // --------------------------------------------------------------- billing

  Future<PlanSummary> planSummary() async => PlanSummary.fromJson(
      await _get('/billing/subscription') as Map<String, dynamic>);

  Future<List<BillingPlan>> billingPlans() async {
    final json = await _get('/billing/plans') as Map<String, dynamic>;
    return (json['plans'] as List<dynamic>)
        .map((row) => BillingPlan.fromJson(row as Map<String, dynamic>))
        .toList();
  }

  /// Starts a hosted checkout and returns where to send the customer.
  ///
  /// Only a plan id crosses the wire — never a price. The server resolves what
  /// to charge from its own configuration, so a tampered client cannot ask to
  /// be sold something cheaper.
  Future<CheckoutSession> startCheckout(String plan,
      {String interval = 'month'}) async {
    final json = await _send(
      'POST',
      '/billing/checkout-session',
      {'plan': plan, 'interval': interval},
    ) as Map<String, dynamic>;
    return CheckoutSession.fromJson(json);
  }

  /// A link to the provider's own page for cancelling, changing a card, or
  /// downloading invoices. None of those flows are rebuilt in this app.
  Future<String> billingPortalUrl() async {
    final json =
        await _send('POST', '/billing/portal-session') as Map<String, dynamic>;
    return json['url'] as String;
  }

  void close() => _http.close();
}

class TransactionPage {
  const TransactionPage({required this.transactions, required this.nextCursor});

  final List<Transaction> transactions;
  final String? nextCursor;
}

/// A rejected sign-in or registration, with something worth showing the user.
///
/// Separate from ApiException because these are the only API errors a person is
/// expected to act on — every other failure is a bug or an outage.
class AuthException implements Exception {
  AuthException(this.message,
      {this.problems = const [], this.retryAfterSeconds});

  factory AuthException.fromResponse(
      int statusCode, Map<String, dynamic> body) {
    final problems = (body['problems'] as List<dynamic>?)?.cast<String>() ??
        const <String>[];

    // The API returns `message` as a string, or as a list when several
    // validation rules failed at once.
    final rawMessage = body['message'];
    final message = rawMessage is List
        ? rawMessage.join(' ')
        : rawMessage as String? ?? 'Something went wrong. Try again.';

    return AuthException(
      statusCode == 429
          ? 'Too many attempts. Wait a moment and try again.'
          : message,
      problems: problems,
      retryAfterSeconds: (body['retryAfterSeconds'] as num?)?.toInt(),
    );
  }

  final String message;

  /// Password-policy failures, so all of them can be fixed in one go rather
  /// than discovered one attempt at a time.
  final List<String> problems;
  final int? retryAfterSeconds;

  String get displayMessage => problems.isEmpty ? message : problems.join('\n');

  @override
  String toString() => displayMessage;
}

class MfaRequiredException implements Exception {
  const MfaRequiredException(this.challengeToken, this.expiresAt);
  final String challengeToken;
  final DateTime expiresAt;
}

class ApiException implements Exception {
  ApiException(this.path, this.statusCode, this.body);

  final String path;
  final int statusCode;
  final String body;

  @override
  String toString() => 'ApiException($statusCode on $path): $body';
}

/// The server refused because the user's plan does not include this.
///
/// Recognised centrally in the client rather than screen by screen, so that a
/// feature moving behind the paywall does not require every caller to learn
/// about billing. Without this, a gated route surfaces as a raw JSON blob in a
/// snackbar — which reads as a bug, not a price.
class PlanUpgradeRequiredException implements Exception {
  PlanUpgradeRequiredException({
    required this.path,
    required this.message,
    this.entitlement,
    this.requiredPlan,
  });

  /// Returns null when the response is an ordinary error, so callers can fall
  /// back to [ApiException]. A 403 is only a paywall when the server says so:
  /// an authorisation failure elsewhere must not be dressed up as an upsell.
  static PlanUpgradeRequiredException? maybeFrom(
      String path, http.Response response) {
    if (response.statusCode != 403 || response.body.isEmpty) return null;
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) return null;
      if (decoded['error'] != 'plan_upgrade_required') return null;

      final rawMessage = decoded['message'];
      return PlanUpgradeRequiredException(
        path: path,
        message: rawMessage is String
            ? rawMessage
            : 'Your plan does not include this feature.',
        entitlement: decoded['entitlement'] as String?,
        requiredPlan: decoded['requiredPlan'] as String?,
      );
    } catch (_) {
      return null;
    }
  }

  final String path;
  final String message;

  /// The named capability that was missing, e.g. `unlimited_bank_links`.
  final String? entitlement;

  /// The cheapest plan that would have allowed it.
  final String? requiredPlan;

  @override
  String toString() => message;
}
