import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Thin Flutter boundary for the platform OCR engines. Image bytes and paths
/// stay on the device: this channel returns only the recognised transcript,
/// which the person can review before deciding to attach it to a transaction.
class ReceiptPhotoRecognizer {
  ReceiptPhotoRecognizer({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel(_channelName);

  static const _channelName = 'com.finverse.finance/receipt_vision';
  static const _maximumTranscriptLength = 8000;

  final MethodChannel _channel;

  static bool get isSupported =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  Future<String> recognizeFile(String localPath) async {
    if (!isSupported) {
      throw const ReceiptPhotoRecognitionException(
        'Receipt photo scanning is available in the FINVERSE Android and iPhone apps.',
      );
    }
    if (localPath.trim().isEmpty) {
      throw const ReceiptPhotoRecognitionException(
          'Choose a receipt photo first.');
    }

    try {
      final text =
          await _channel.invokeMethod<String>('recognize', {'path': localPath});
      final transcript = text?.trim() ?? '';
      if (transcript.isEmpty) {
        throw const ReceiptPhotoRecognitionException(
          'No readable receipt text was found. Try a sharper, well-lit photo or paste the text instead.',
        );
      }
      if (transcript.length > _maximumTranscriptLength) {
        throw const ReceiptPhotoRecognitionException(
          'This receipt has too much text to attach. Crop it to the receipt or paste the relevant lines.',
        );
      }
      return transcript;
    } on ReceiptPhotoRecognitionException {
      rethrow;
    } on PlatformException catch (error) {
      switch (error.code) {
        case 'NO_TEXT':
          throw const ReceiptPhotoRecognitionException(
            'No readable receipt text was found. Try a sharper, well-lit photo or paste the text instead.',
          );
        case 'TEXT_TOO_LONG':
          throw const ReceiptPhotoRecognitionException(
            'This receipt has too much text to attach. Crop it to the receipt or paste the relevant lines.',
          );
        default:
          throw const ReceiptPhotoRecognitionException(
            'FINVERSE could not scan that receipt photo. You can paste the receipt text instead.',
          );
      }
    } catch (_) {
      throw const ReceiptPhotoRecognitionException(
        'FINVERSE could not scan that receipt photo. You can paste the receipt text instead.',
      );
    }
  }
}

class ReceiptPhotoRecognitionException implements Exception {
  const ReceiptPhotoRecognitionException(this.message);

  final String message;

  @override
  String toString() => message;
}
