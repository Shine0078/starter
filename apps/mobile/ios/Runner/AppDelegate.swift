import Flutter
import UIKit
import Vision

#if canImport(workmanager_apple)
import workmanager_apple
#endif

#if canImport(LinkKit)
import LinkKit
#endif

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var pendingPlaidCall: FlutterResult?
  private var cachedPlaidResult: [String: Any?]?
#if canImport(LinkKit)
  private var plaidSession: PlaidLinkSession?
#endif

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
#if canImport(workmanager_apple)
    // UIScene apps must register background launch handlers before application
    // launch finishes; the worker uses Keychain/session plugins in its own
    // engine, so register those plugins there as well.
    WorkmanagerPlugin.registerLaunchHandlers()
    WorkmanagerPlugin.setPluginRegistrantCallback { registry in
      GeneratedPluginRegistrant.register(with: registry)
    }
#endif
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    let channel = FlutterMethodChannel(
      name: "com.finverse.finance/plaid_link",
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    channel.setMethodCallHandler { [weak self] call, result in
      self?.handlePlaidCall(call, result: result)
    }
    let receiptVisionChannel = FlutterMethodChannel(
      name: "com.finverse.finance/receipt_vision",
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    receiptVisionChannel.setMethodCallHandler { [weak self] call, result in
      self?.handleReceiptVisionCall(call, result: result)
    }
  }

  private func handlePlaidCall(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "consumePending":
      result(cachedPlaidResult)
      cachedPlaidResult = nil
    case "open":
      openPlaid(call, result: result)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func openPlaid(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard pendingPlaidCall == nil else {
      result(FlutterError(
        code: "LINK_ALREADY_OPEN",
        message: "Plaid Link is already open.",
        details: nil
      ))
      return
    }
    guard
      let arguments = call.arguments as? [String: Any],
      let token = arguments["token"] as? String,
      !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      result(FlutterError(
        code: "INVALID_LINK_TOKEN",
        message: "A Link token is required.",
        details: nil
      ))
      return
    }

#if canImport(LinkKit)
    guard let presenter = topViewController() else {
      result(FlutterError(
        code: "LINK_PRESENTATION_FAILED",
        message: "FINVERSE could not find the active iPhone screen.",
        details: nil
      ))
      return
    }

    pendingPlaidCall = result
    let configuration = LinkTokenConfiguration(
      token: token,
      onSuccess: { [weak self] success in
        self?.deliverPlaidResult([
          "status": "success",
          "publicToken": success.publicToken,
          "institutionId": success.metadata.institution.id,
          "institutionName": success.metadata.institution.name,
          "linkSessionId": success.metadata.linkSessionID,
        ])
      },
      onExit: { [weak self] exit in
        self?.deliverPlaidResult([
          "status": "exit",
          "errorMessage": exit.error?.displayMessage,
        ])
      },
      onEvent: nil,
      onLoad: nil
    )

    do {
      plaidSession = try Plaid.createPlaidLinkSession(configuration: configuration)
      plaidSession?.open(using: .viewController(presenter))
    } catch {
      pendingPlaidCall = nil
      result(FlutterError(
        code: "LINK_OPEN_FAILED",
        message: "Could not open Plaid Link.",
        details: String(describing: error)
      ))
    }
#else
    result(FlutterError(
      code: "LINKKIT_UNAVAILABLE",
      message: "This iOS build is missing Plaid LinkKit.",
      details: nil
    ))
#endif
  }

  private func deliverPlaidResult(_ payload: [String: Any?]) {
    let callback = pendingPlaidCall
    pendingPlaidCall = nil
#if canImport(LinkKit)
    plaidSession = nil
#endif
    if let callback {
      callback(payload)
    } else {
      cachedPlaidResult = payload
    }
  }

  /// Apple Vision performs text recognition locally. The file URL is used only
  /// inside this process and only the transcript is returned to Flutter for
  /// user review before the existing text-only receipt API is called.
  private func handleReceiptVisionCall(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == "recognize" else {
      result(FlutterMethodNotImplemented)
      return
    }
    guard
      let arguments = call.arguments as? [String: Any],
      let path = arguments["path"] as? String,
      !path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      FileManager.default.fileExists(atPath: path)
    else {
      result(FlutterError(code: "INVALID_IMAGE", message: "A receipt image is required.", details: nil))
      return
    }

    let request = VNRecognizeTextRequest { request, error in
      DispatchQueue.main.async {
        guard error == nil else {
          result(FlutterError(code: "OCR_FAILED", message: "Receipt text recognition failed.", details: nil))
          return
        }
        let observations = request.results as? [VNRecognizedTextObservation] ?? []
        let transcript = observations
          .compactMap { $0.topCandidates(1).first?.string }
          .joined(separator: "\n")
          .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !transcript.isEmpty else {
          result(FlutterError(code: "NO_TEXT", message: "No receipt text found.", details: nil))
          return
        }
        guard transcript.count <= 8_000 else {
          result(FlutterError(code: "TEXT_TOO_LONG", message: "Receipt text is too long.", details: nil))
          return
        }
        result(transcript)
      }
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-US", "fr-CA"]
    let imageURL = URL(fileURLWithPath: path)
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try VNImageRequestHandler(url: imageURL, options: [:]).perform([request])
      } catch {
        DispatchQueue.main.async {
          result(FlutterError(code: "OCR_FAILED", message: "Receipt text recognition failed.", details: nil))
        }
      }
    }
  }

  private func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes
      .flatMap(\.windows)
      .first(where: { $0.isKeyWindow }) ?? scenes.flatMap(\.windows).first
    var controller = window?.rootViewController
    while let presented = controller?.presentedViewController {
      controller = presented
    }
    if let navigation = controller as? UINavigationController {
      return navigation.visibleViewController ?? navigation
    }
    if let tab = controller as? UITabBarController {
      return tab.selectedViewController ?? tab
    }
    return controller
  }
}
