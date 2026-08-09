import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Writes to the temp directory, shares by path, then deletes.
///
/// The delete is part of this function rather than the caller's job because
/// forgetting it leaves an unencrypted copy of somebody's entire financial
/// history sitting in a world-readable temp directory until the OS decides to
/// reclaim it. That is a footgun nobody should have to remember not to fire.
Future<void> shareGeneratedFile({
  required Uint8List bytes,
  required String fileName,
  required String mimeType,
  required String title,
  required String subject,
}) async {
  final directory = await getTemporaryDirectory();
  final file = File('${directory.path}${Platform.pathSeparator}$fileName');
  await file.writeAsBytes(bytes, flush: true);
  try {
    await SharePlus.instance.share(ShareParams(
      files: [XFile(file.path, mimeType: mimeType)],
      title: title,
      subject: subject,
    ));
  } finally {
    try {
      if (await file.exists()) await file.delete();
    } catch (_) {
      // Another app may still hold the share open. The platform reclaims its
      // own temp directory, so this is a best effort rather than a guarantee.
    }
  }
}
