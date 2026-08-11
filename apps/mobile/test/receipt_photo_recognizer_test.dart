import 'package:finverse/api/receipt_photo_recognizer.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const channel = MethodChannel('com.finverse.finance/receipt_vision');

  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test(
      'passes only the selected local image path to native OCR and returns its transcript',
      () async {
    MethodCall? call;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (received) async {
      call = received;
      return 'Corner Market\nTotal 12.50';
    });
    final recognizer = ReceiptPhotoRecognizer(channel: channel);

    final transcript =
        await recognizer.recognizeFile('/private/cache/receipt.jpg');

    expect(transcript, 'Corner Market\nTotal 12.50');
    expect(call?.method, 'recognize');
    expect(call?.arguments, {'path': '/private/cache/receipt.jpg'});
  });

  test('turns no-text native failures into an actionable message', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async {
      throw PlatformException(code: 'NO_TEXT');
    });
    final recognizer = ReceiptPhotoRecognizer(channel: channel);

    await expectLater(
      recognizer.recognizeFile('/private/cache/receipt.jpg'),
      throwsA(
        isA<ReceiptPhotoRecognitionException>().having(
          (error) => error.message,
          'message',
          contains('No readable receipt text'),
        ),
      ),
    );
  });
}
