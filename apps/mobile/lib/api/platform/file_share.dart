/// Hands a generated file to the operating system's share sheet.
///
/// The native path writes to a temporary directory and shares the file by path;
/// `path_provider` and `dart:io` are unavailable in a browser, so the web path
/// shares the bytes directly instead. Both end at the same place — the user
/// picking where their export or report should go.
library;

export 'file_share_stub.dart' if (dart.library.io) 'file_share_native.dart';
