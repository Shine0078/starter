import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/models.dart';

/// Thin client over the FINVERSE API.
///
/// Deliberately dumb: it parses JSON into models and nothing else. No caching,
/// no business logic. The financial rules live server-side in the domain layer
/// (see ADR-0002) so that the phone and any future web client cannot drift
/// apart in their arithmetic.
class ApiClient {
  ApiClient({http.Client? httpClient, String? baseUrl})
      : _http = httpClient ?? http.Client(),
        baseUrl = baseUrl ??
            const String.fromEnvironment(
              'API_BASE_URL',
              // Android emulator's alias for the host machine. `localhost`
              // inside the emulator is the emulator itself.
              defaultValue: 'http://10.0.2.2:3100',
            );

  final http.Client _http;
  final String baseUrl;

  Uri _uri(String path) => Uri.parse('$baseUrl/api$path');

  Future<dynamic> _get(String path) async {
    final response = await _http.get(_uri(path));
    if (response.statusCode >= 400) {
      throw ApiException(path, response.statusCode, response.body);
    }
    return jsonDecode(response.body);
  }

  Future<dynamic> _send(String method, String path, [Object? body]) async {
    final request = http.Request(method, _uri(path))
      ..headers['content-type'] = 'application/json';
    if (body != null) request.body = jsonEncode(body);

    final streamed = await _http.send(request);
    final response = await http.Response.fromStream(streamed);
    if (response.statusCode >= 400) {
      throw ApiException(path, response.statusCode, response.body);
    }
    return response.body.isEmpty ? null : jsonDecode(response.body);
  }

  Future<SyncResult> sync() async {
    final json = await _send('POST', '/sync') as Map<String, dynamic>;
    return SyncResult.fromJson(json);
  }

  Future<List<Account>> accounts() async {
    final json = await _get('/accounts') as List<dynamic>;
    return json.map((e) => Account.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<Transaction>> transactions({int limit = 50, String? search}) async {
    final query = search == null || search.isEmpty
        ? '?limit=$limit'
        : '?limit=$limit&search=${Uri.encodeQueryComponent(search)}';
    final json = await _get('/transactions$query') as Map<String, dynamic>;
    return (json['transactions'] as List<dynamic>)
        .map((e) => Transaction.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<Transaction>> needsReview() async {
    final json = await _get('/transactions/needs-review') as Map<String, dynamic>;
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

class ApiException implements Exception {
  ApiException(this.path, this.statusCode, this.body);

  final String path;
  final int statusCode;
  final String body;

  @override
  String toString() => 'ApiException($statusCode on $path): $body';
}
