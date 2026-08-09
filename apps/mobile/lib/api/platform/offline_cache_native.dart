import '../offline_cache.dart';
import 'offline_cache_sqlite.dart';

export 'offline_cache_sqlite.dart';

/// Android and iOS: the encrypted SQLite cache.
OfflineCacheStore createOfflineCache() => EncryptedSqliteOfflineCache();
