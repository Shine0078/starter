// Wire models mirroring the API's response shapes.
//
// Monetary fields arrive twice: an integer in minor units for arithmetic and
// comparison, and a preformatted display string. The client renders the
// string and never re-derives it, so currency formatting stays consistent
// across platforms and never drifts from the server's view (ADR-0003).

/// The signed-in user. Never carries a password hash — the API does not send one.
class PublicUser {
  const PublicUser({
    required this.id,
    required this.email,
    required this.emailVerified,
    this.displayName,
  });

  factory PublicUser.fromJson(Map<String, dynamic> json) => PublicUser(
        id: json['id'] as String,
        email: json['email'] as String,
        emailVerified: json['emailVerified'] as bool? ?? false,
        displayName: json['displayName'] as String?,
      );

  final String id;
  final String email;
  final bool emailVerified;
  final String? displayName;

  String get label => displayName?.isNotEmpty == true ? displayName! : email;
}

class AppSession {
  const AppSession({
    required this.id,
    required this.issuedAt,
    required this.expiresAt,
    required this.current,
    this.lastUsedAt,
    this.userAgent,
    this.ipAddress,
  });

  factory AppSession.fromJson(Map<String, dynamic> json) => AppSession(
        id: json['id'] as String,
        issuedAt: json['issuedAt'] as String,
        expiresAt: json['expiresAt'] as String,
        lastUsedAt: json['lastUsedAt'] as String?,
        userAgent: json['userAgent'] as String?,
        ipAddress: json['ipAddress'] as String?,
        current: json['current'] as bool,
      );

  final String id;
  final String issuedAt;
  final String expiresAt;
  final String? lastUsedAt;
  final String? userAgent;
  final String? ipAddress;
  final bool current;
}

class BankLink {
  const BankLink({
    required this.id,
    required this.institutionName,
    required this.status,
    required this.createdAt,
    this.institutionId,
    this.errorCode,
    this.lastSyncedAt,
  });

  factory BankLink.fromJson(Map<String, dynamic> json) => BankLink(
        id: json['id'] as String,
        institutionName: json['institutionName'] as String,
        institutionId: json['institutionId'] as String?,
        status: json['status'] as String,
        errorCode: json['errorCode'] as String?,
        lastSyncedAt: json['lastSyncedAt'] as String?,
        createdAt: json['createdAt'] as String,
      );

  final String id;
  final String institutionName;
  final String? institutionId;
  final String status;
  final String? errorCode;
  final String? lastSyncedAt;
  final String createdAt;

  bool get needsReconnect => status == 'needs_reauth';
}

class FinanceNotification {
  const FinanceNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.message,
    required this.severity,
    required this.createdAt,
    this.readAt,
  });

  factory FinanceNotification.fromJson(Map<String, dynamic> json) =>
      FinanceNotification(
        id: json['id'] as String,
        kind: json['kind'] as String,
        title: json['title'] as String,
        message: json['message'] as String,
        severity: json['severity'] as String,
        createdAt: json['createdAt'] as String,
        readAt: json['readAt'] as String?,
      );

  final String id;
  final String kind;
  final String title;
  final String message;
  final String severity;
  final String createdAt;
  final String? readAt;

  bool get unread => readAt == null;

  FinanceNotification asRead() => FinanceNotification(
        id: id,
        kind: kind,
        title: title,
        message: message,
        severity: severity,
        createdAt: createdAt,
        readAt: DateTime.now().toUtc().toIso8601String(),
      );
}

class NotificationPreferences {
  const NotificationPreferences({
    required this.budget,
    required this.bills,
    required this.creditUtilization,
    required this.subscriptions,
    required this.lowBalance,
    required this.unusualTransactions,
    required this.bankSync,
    required this.security,
  });

  factory NotificationPreferences.fromJson(Map<String, dynamic> json) =>
      NotificationPreferences(
        budget: json['budget'] as bool,
        bills: json['bills'] as bool,
        creditUtilization: json['creditUtilization'] as bool,
        subscriptions: json['subscriptions'] as bool,
        lowBalance: json['lowBalance'] as bool,
        unusualTransactions: json['unusualTransactions'] as bool,
        bankSync: json['bankSync'] as bool,
        security: json['security'] as bool,
      );

  final bool budget;
  final bool bills;
  final bool creditUtilization;
  final bool subscriptions;
  final bool lowBalance;
  final bool unusualTransactions;
  final bool bankSync;
  final bool security;

  Map<String, bool> toJson() => {
        'budget': budget,
        'bills': bills,
        'creditUtilization': creditUtilization,
        'subscriptions': subscriptions,
        'lowBalance': lowBalance,
        'unusualTransactions': unusualTransactions,
        'bankSync': bankSync,
        'security': security,
      };
}

class SyncResult {
  SyncResult({
    required this.accounts,
    required this.fetched,
    required this.inserted,
    required this.updated,
    required this.coverage,
    required this.needsReview,
  });

  factory SyncResult.fromJson(Map<String, dynamic> json) => SyncResult(
        accounts: json['accounts'] as int,
        fetched: json['fetched'] as int,
        inserted: json['inserted'] as int,
        updated: json['updated'] as int,
        coverage: (json['coverage'] as num).toDouble(),
        needsReview: json['needsReview'] as int,
      );

  final int accounts;
  final int fetched;
  final int inserted;
  final int updated;
  final double coverage;
  final int needsReview;
}

class Account {
  Account({
    required this.id,
    required this.name,
    required this.type,
    required this.mask,
    required this.balanceCurrent,
    required this.balanceFormatted,
    this.utilization,
  });

  factory Account.fromJson(Map<String, dynamic> json) => Account(
        id: json['id'] as String,
        name: json['name'] as String,
        type: json['type'] as String,
        mask: json['mask'] as String,
        balanceCurrent: json['balanceCurrent'] as int,
        balanceFormatted: json['balanceFormatted'] as String,
        utilization: (json['utilization'] as num?)?.toDouble(),
      );

  final String id;
  final String name;
  final String type;
  final String mask;
  final int balanceCurrent;
  final String balanceFormatted;

  /// Credit cards only; null everywhere else.
  final double? utilization;

  bool get isCreditCard => type == 'credit_card';
}

class Transaction {
  Transaction({
    required this.id,
    required this.postedAt,
    required this.amount,
    required this.amountFormatted,
    required this.rawDescriptor,
    required this.normalizedDescriptor,
    required this.categorySlug,
    required this.categorySource,
    required this.categoryConfidence,
    required this.pending,
    required this.isRecurring,
    this.merchant,
  });

  factory Transaction.fromJson(Map<String, dynamic> json) => Transaction(
        id: json['id'] as String,
        postedAt: json['postedAt'] as String,
        amount: json['amount'] as int,
        amountFormatted: json['amountFormatted'] as String,
        rawDescriptor: json['rawDescriptor'] as String,
        normalizedDescriptor: json['normalizedDescriptor'] as String,
        categorySlug: json['categorySlug'] as String,
        categorySource: json['categorySource'] as String,
        categoryConfidence: (json['categoryConfidence'] as num).toDouble(),
        pending: json['pending'] as bool,
        isRecurring: json['isRecurring'] as bool,
        merchant: json['merchant'] as String?,
      );

  final String id;
  final String postedAt;
  final int amount;
  final String amountFormatted;
  final String rawDescriptor;
  final String normalizedDescriptor;
  final String categorySlug;
  final String categorySource;
  final double categoryConfidence;
  final bool pending;
  final bool isRecurring;
  final String? merchant;

  String get displayName => merchant ?? rawDescriptor;

  /// True when the user set this category themselves. The UI should never
  /// present a user's own choice as a suggestion.
  bool get isUserSet =>
      categorySource == 'user_manual' || categorySource == 'user_rule';

  bool get needsReview => categorySource == 'unknown';
}

class Budget {
  Budget({
    required this.id,
    required this.categorySlug,
    required this.limitAmount,
    required this.period,
  });

  factory Budget.fromJson(Map<String, dynamic> json) => Budget(
        id: json['id'] as String,
        categorySlug: json['categorySlug'] as String,
        limitAmount: json['limitAmount'] as int,
        period: json['period'] as String,
      );

  final String id;
  final String categorySlug;
  final int limitAmount;
  final String period;
}

class BudgetProgress {
  BudgetProgress({
    required this.budgetId,
    required this.categorySlug,
    required this.categoryName,
    required this.spentFormatted,
    required this.limitFormatted,
    required this.remainingFormatted,
    required this.percentUsed,
    required this.status,
    required this.daysRemaining,
    required this.projectedToExceed,
  });

  factory BudgetProgress.fromJson(Map<String, dynamic> json) => BudgetProgress(
        budgetId: json['budgetId'] as String,
        categorySlug: json['categorySlug'] as String,
        categoryName: json['categoryName'] as String,
        spentFormatted: json['spentFormatted'] as String,
        limitFormatted: json['limitFormatted'] as String,
        remainingFormatted: json['remainingFormatted'] as String,
        percentUsed: (json['percentUsed'] as num).toDouble(),
        status: json['status'] as String,
        daysRemaining: json['daysRemaining'] as int,
        projectedToExceed: json['projectedToExceed'] as bool,
      );

  final String budgetId;
  final String categorySlug;
  final String categoryName;
  final String spentFormatted;
  final String limitFormatted;
  final String remainingFormatted;
  final double percentUsed;
  final String status;
  final int daysRemaining;
  final bool projectedToExceed;

  bool get isExceeded => status == 'exceeded';
}

class GoalProgress {
  GoalProgress({
    required this.id,
    required this.name,
    required this.targetAmount,
    required this.savedAmount,
    required this.remainingAmount,
    required this.targetFormatted,
    required this.savedFormatted,
    required this.remainingFormatted,
    required this.percentComplete,
    this.targetDate,
    this.suggestedMonthlyFormatted,
    this.projectedCompletionDate,
  });

  factory GoalProgress.fromJson(Map<String, dynamic> json) {
    final goal = json['goal'] as Map<String, dynamic>;
    return GoalProgress(
      id: goal['id'] as String,
      name: goal['name'] as String,
      targetAmount: goal['targetAmount'] as int,
      savedAmount: json['savedAmount'] as int,
      remainingAmount: json['remainingAmount'] as int,
      targetFormatted: json['targetFormatted'] as String,
      savedFormatted: json['savedFormatted'] as String,
      remainingFormatted: json['remainingFormatted'] as String,
      percentComplete: (json['percentComplete'] as num).toDouble(),
      targetDate: goal['targetDate'] as String?,
      suggestedMonthlyFormatted: json['suggestedMonthlyFormatted'] as String?,
      projectedCompletionDate: json['projectedCompletionDate'] as String?,
    );
  }

  final String id;
  final String name;
  final int targetAmount;
  final int savedAmount;
  final int remainingAmount;
  final String targetFormatted;
  final String savedFormatted;
  final String remainingFormatted;
  final double percentComplete;
  final String? targetDate;
  final String? suggestedMonthlyFormatted;
  final String? projectedCompletionDate;

  bool get complete => remainingAmount == 0;
}

class ScoreComponent {
  ScoreComponent({
    required this.key,
    required this.label,
    required this.points,
    required this.maxPoints,
    required this.detail,
    this.action,
  });

  factory ScoreComponent.fromJson(Map<String, dynamic> json) => ScoreComponent(
        key: json['key'] as String,
        label: json['label'] as String,
        points: json['points'] as int,
        maxPoints: json['maxPoints'] as int,
        detail: json['detail'] as String,
        action: json['action'] as String?,
      );

  final String key;
  final String label;
  final int points;
  final int maxPoints;
  final String detail;
  final String? action;

  double get ratio => maxPoints == 0 ? 0 : points / maxPoints;
}

class HealthScore {
  HealthScore({
    required this.score,
    required this.band,
    required this.components,
    required this.topActions,
  });

  factory HealthScore.fromJson(Map<String, dynamic> json) => HealthScore(
        score: json['score'] as int,
        band: json['band'] as String,
        components: (json['components'] as List<dynamic>)
            .map((e) => ScoreComponent.fromJson(e as Map<String, dynamic>))
            .toList(),
        topActions: (json['topActions'] as List<dynamic>)
            .map((e) => e as String)
            .toList(),
      );

  final int score;
  final String band;
  final List<ScoreComponent> components;
  final List<String> topActions;
}

class Insight {
  Insight({
    required this.kind,
    required this.severity,
    required this.title,
    required this.detail,
    required this.evidenceCount,
  });

  factory Insight.fromJson(Map<String, dynamic> json) => Insight(
        kind: json['kind'] as String,
        severity: json['severity'] as String,
        title: json['title'] as String,
        detail: json['detail'] as String,
        evidenceCount: (json['evidenceTransactionIds'] as List<dynamic>).length,
      );

  final String kind;
  final String severity;
  final String title;
  final String detail;

  /// How many transactions produced this insight. Every insight must be
  /// traceable back to the data behind it.
  final int evidenceCount;
}

class InsightsReport {
  InsightsReport({
    required this.income,
    required this.expenses,
    required this.netCashFlow,
    required this.savingsRate,
    required this.topCategories,
    required this.insights,
  });

  factory InsightsReport.fromJson(Map<String, dynamic> json) {
    final headline = json['headline'] as Map<String, dynamic>;
    return InsightsReport(
      income: headline['income'] as String,
      expenses: headline['expenses'] as String,
      netCashFlow: headline['netCashFlow'] as String,
      savingsRate: headline['savingsRate'] as String,
      topCategories: (json['topCategories'] as List<dynamic>)
          .map((e) => CategorySpend.fromJson(e as Map<String, dynamic>))
          .toList(),
      insights: (json['insights'] as List<dynamic>)
          .map((e) => Insight.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  final String income;
  final String expenses;
  final String netCashFlow;
  final String savingsRate;
  final List<CategorySpend> topCategories;
  final List<Insight> insights;
}

class CategorySpend {
  CategorySpend({
    required this.categorySlug,
    required this.categoryName,
    required this.total,
    required this.totalFormatted,
    required this.transactionCount,
  });

  factory CategorySpend.fromJson(Map<String, dynamic> json) => CategorySpend(
        categorySlug: json['categorySlug'] as String,
        categoryName: json['categoryName'] as String,
        total: json['total'] as int,
        totalFormatted: json['totalFormatted'] as String,
        transactionCount: json['transactionCount'] as int,
      );

  final String categorySlug;
  final String categoryName;
  final int total;
  final String totalFormatted;
  final int transactionCount;
}

class Subscription {
  Subscription({
    required this.merchant,
    required this.cadence,
    required this.typicalAmountFormatted,
    required this.annualCostFormatted,
    required this.nextExpected,
    required this.hasPriceIncrease,
  });

  factory Subscription.fromJson(Map<String, dynamic> json) => Subscription(
        merchant: json['merchant'] as String,
        cadence: json['cadence'] as String,
        typicalAmountFormatted: json['typicalAmountFormatted'] as String,
        annualCostFormatted: json['annualCostFormatted'] as String,
        nextExpected: json['nextExpected'] as String,
        hasPriceIncrease: json['priceIncrease'] != null,
      );

  final String merchant;
  final String cadence;
  final String typicalAmountFormatted;
  final String annualCostFormatted;
  final String nextExpected;
  final bool hasPriceIncrease;
}

class SubscriptionsReport {
  SubscriptionsReport({
    required this.count,
    required this.monthlyTotalFormatted,
    required this.annualTotalFormatted,
    required this.subscriptions,
    required this.priceIncreases,
    required this.possiblyCancelled,
  });

  factory SubscriptionsReport.fromJson(Map<String, dynamic> json) =>
      SubscriptionsReport(
        count: json['count'] as int,
        monthlyTotalFormatted: json['monthlyTotalFormatted'] as String,
        annualTotalFormatted: json['annualTotalFormatted'] as String,
        subscriptions: (json['subscriptions'] as List<dynamic>)
            .map((e) => Subscription.fromJson(e as Map<String, dynamic>))
            .toList(),
        priceIncreases: (json['priceIncreases'] as List<dynamic>? ?? const [])
            .map((e) =>
                SubscriptionPriceIncrease.fromJson(e as Map<String, dynamic>))
            .toList(),
        possiblyCancelled:
            (json['possiblyCancelled'] as List<dynamic>? ?? const [])
                .cast<String>(),
      );

  final int count;
  final String monthlyTotalFormatted;
  final String annualTotalFormatted;
  final List<Subscription> subscriptions;
  final List<SubscriptionPriceIncrease> priceIncreases;
  final List<String> possiblyCancelled;
}

class SubscriptionPriceIncrease {
  SubscriptionPriceIncrease({
    required this.merchant,
    required this.from,
    required this.to,
    required this.percent,
    required this.annualImpact,
  });

  factory SubscriptionPriceIncrease.fromJson(Map<String, dynamic> json) =>
      SubscriptionPriceIncrease(
        merchant: json['merchant'] as String,
        from: json['from'] as String,
        to: json['to'] as String,
        percent: json['percent'] as int,
        annualImpact: json['annualImpact'] as String,
      );

  final String merchant;
  final String from;
  final String to;
  final int percent;
  final String annualImpact;
}
