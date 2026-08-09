import '../offline_cache.dart';

/// Web: no persistent cache. Reads always go to the network, and a failure is
/// reported as a failure rather than answered with stale figures.
OfflineCacheStore createOfflineCache() => NoopOfflineCacheStore();
