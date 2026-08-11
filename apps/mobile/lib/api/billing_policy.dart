/// How this build is allowed to sell a subscription.
///
/// **Read this before shipping to a store.**
///
/// Apple and Google both require their own purchase systems for digital
/// subscriptions sold inside an app, and both take a cut. Sending a user from
/// inside the app to a web checkout is the thing their review guidelines
/// specifically police, and it is a common cause of rejection. The server-side
/// billing built in ADR-0007 is therefore the **web** path: correct for a
/// browser, and a store-review risk if wired to a button in here without either
/// a link-out entitlement or a native billing integration.
///
/// This is a deliberate switch rather than a hidden assumption, because it is a
/// commercial and legal decision rather than an engineering one.
enum BillingPurchaseMode {
  /// Show plan state and what each tier includes, but offer no way to buy.
  /// Safe everywhere. Users on the free tier still see exactly what they would
  /// get, which is what makes the paywall honest rather than a dead end.
  informational,

  /// Open the provider's hosted checkout in the system browser.
  ///
  /// Correct for a web or sideloaded build. Before a store submission, confirm
  /// you hold the relevant external-purchase-link entitlement, or switch to a
  /// native integration.
  linkOut,

  /// StoreKit / Google Play Billing. **Not implemented.** `Subscription` on the
  /// server is provider-shaped so a second adapter fits behind the same port;
  /// see ADR-0007. Selecting this today disables purchasing rather than
  /// pretending to work.
  nativeStore,
}

/// Defaults to [BillingPurchaseMode.informational] — the only value that is
/// safe in every distribution channel without a further decision.
///
/// Override at build time:
///   flutter build apk --dart-define=BILLING_PURCHASE_MODE=linkOut
const String _rawPurchaseMode = String.fromEnvironment(
  'BILLING_PURCHASE_MODE',
  defaultValue: 'informational',
);

// Const so the unreachable branches are tree-shaken out of a release build: a
// binary built in `informational` mode contains no checkout path at all, which
// is a stronger statement to a store reviewer than a runtime flag.
//
// An unrecognised value falls back to the safe mode rather than failing the
// build. A typo in a CI flag should not produce a store-rejectable binary.
const BillingPurchaseMode kBillingPurchaseMode = _rawPurchaseMode == 'linkOut'
    ? BillingPurchaseMode.linkOut
    : _rawPurchaseMode == 'nativeStore'
        ? BillingPurchaseMode.nativeStore
        : BillingPurchaseMode.informational;

/// True when this build may actually start a purchase.
bool canPurchaseWith(BillingPurchaseMode mode) =>
    mode == BillingPurchaseMode.linkOut;
