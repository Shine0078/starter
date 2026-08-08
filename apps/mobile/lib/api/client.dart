import 'dart:convert';
import 'dart:async';

import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart';

import '../models/models.dart';
import 'offline_cache.dart';
import 'session_store.dart';

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
        baseUrl = baseUrl ??
            const String.fromEnvironment(
              'API_BASE_URL',
              // Android emulator's alias for the host machine. `localhost`
              // inside the emulator is the emulator itself.
              defaultValue: 'http://10.0.2.2:3000',
            );

  final http.Client _http;
  final String baseUrl;
  final SessionStore sessionStore;
  final OfflineCacheStore offlineCache;

  SessionTokens? _tokens;
  final ValueNotifier<DateTime?> offlineCacheStatus = ValueNotifier(null);

  DateTime? get offlineCacheUpdatedAt => offlineCacheStatus.value;
  bool get usedOfflineCache => offlineCacheStatus.value != null;
  void resetOfflineStatus() => offlineCacheStatus.value = null;

  /// Called when the session is gone for good, so the app can show sign-in.
  void Function()? onSessionExpired;

  Uri _uri(String path) => Uri.parse('$baseUrl/api$path');

  /// True when a stored session was found. Call once at startup.
  Future<bool> restoreSession() async {
    _tokens = await sessionStore.read();
    return _tokens != null;
  }

  bool get isAuthenticated => _tokens != null;

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
      await _http.send(request).timeout(const Duration(seconds: 20)),
    );

    if (response.statusCode == 401 && allowRetry && _tokens != null) {
      if (await _refresh()) return _perform(method, path, body, false);
      await signOut(notifyServer: false);
      onSessionExpired?.call();
    }

    return response;
  }

  Future<dynamic> _get(String path) async {
    final owner = _cacheOwner;
    try {
      final response = await _perform('GET', path, null, true);
      if (response.statusCode >= 400) {
        if (response.statusCode < 500) {
          throw ApiException(path, response.statusCode, response.body);
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
      throw ApiException(path, response.statusCode, response.body);
    }
    return response.body.isEmpty ? null : jsonDecode(response.body);
  }

  // ------------------------------------------------------------------ auth

  Future<PublicUser> register(String email, String password) =>
      _authenticate('/auth/register', {'email': email, 'password': password});

  Future<PublicUser> signIn(String email, String password) =>
      _authenticate('/auth/login', {'email': email, 'password': password});

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
    final response = await _http.post(
      _uri(path),
      headers: {'content-type': 'application/json'},
      body: jsonEncode(body),
    );
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
    final response = await _http.post(
      _uri(path),
      headers: {'content-type': 'application/json'},
      body: jsonEncode(body),
    );

    final decoded = response.body.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode >= 400) {
      throw AuthException.fromResponse(response.statusCode, decoded);
    }

    final user = PublicUser.fromJson(decoded['user'] as Map<String, dynamic>);
    _tokens = SessionTokens.fromJson(decoded['tokens'] as Map<String, dynamic>)
        .withUserId(user.id);
    await sessionStore.write(_tokens!);
    return user;
  }

  Future<bool> _refresh() async {
    final refreshToken = _tokens?.refreshToken;
    if (refreshToken == null) return false;

    try {
      final response = await _http.post(
        _uri('/auth/refresh'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      );
      if (response.statusCode >= 400) return false;

      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      final userId = _cacheOwner;
      _tokens =
          SessionTokens.fromJson(decoded['tokens'] as Map<String, dynamic>)
              .withUserId(userId);
      await sessionStore.write(_tokens!);
      return true;
    } catch (_) {
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

  Future<List<Transaction>> transactions(
      {int limit = 50, String? search}) async {
    final query = search == null || search.isEmpty
        ? '?limit=$limit'
        : '?limit=$limit&search=${Uri.encodeQueryComponent(search)}';
    final json = await _get('/transactions$query') as Map<String, dynamic>;
    return (json['transactions'] as List<dynamic>)
        .map((e) => Transaction.fromJson(e as Map<String, dynamic>))
        .toList();
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

  Future<String> createBankLinkToken({String? linkId}) async {
    final json = await _send(
      'POST',
      '/bank-links/link-token',
      {if (linkId != null) 'linkId': linkId},
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

  Future<SubscriptionsReport> subscriptions() async {
    final json = await _get('/subscriptions') as Map<String, dynamic>;
    return SubscriptionsReport.fromJson(json);
  }

  void close() => _http.close();
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

class ApiException implements Exception {
  ApiException(this.path, this.statusCode, this.body);

  final String path;
  final int statusCode;
  final String body;

  @override
  String toString() => 'ApiException($statusCode on $path): $body';
}
