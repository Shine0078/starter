import 'dart:typed_data';

import 'package:share_plus/share_plus.dart';

/// Web: share the bytes directly. There is no filesystem to stage them on, and
/// nothing to clean up afterwards as a result.
///
/// On iOS Safari this opens the system share sheet; where the browser has no
/// Web Share support it falls back to a download. Either way the bytes never
/// touch a temporary file.
Future<void> shareGeneratedFile({
  required Uint8List bytes,
  required String fileName,
  required String mimeType,
  required String title,
  required String subject,
}) async {
  await SharePlus.instance.share(ShareParams(
    files: [XFile.fromData(bytes, name: fileName, mimeType: mimeType)],
    fileNameOverrides: [fileName],
    title: title,
    subject: subject,
  ));
}
