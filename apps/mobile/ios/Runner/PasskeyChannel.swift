import AuthenticationServices
import Flutter
import Foundation
import UIKit

final class PasskeyChannel: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private var pending: FlutterResult?
  private var presenter: () -> UIViewController?

  init(presenter: @escaping () -> UIViewController?) {
    self.presenter = presenter
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "authenticate":
      start(result: result) { try self.assertionRequest(from: call) }
    case "register":
      start(result: result) { try self.registrationRequest(from: call) }
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func start(result: @escaping FlutterResult, request: () throws -> ASAuthorizationRequest) {
    guard pending == nil else {
      result(FlutterError(code: "BUSY", message: "A passkey ceremony is already in progress.", details: nil))
      return
    }
    do {
      pending = result
      let controller = ASAuthorizationController(authorizationRequests: [try request()])
      controller.delegate = self
      controller.presentationContextProvider = self
      controller.performRequests()
    } catch {
      pending = nil
      result(FlutterError(code: "INVALID_REQUEST", message: error.localizedDescription, details: nil))
    }
  }

  private func assertionRequest(from call: FlutterMethodCall) throws -> ASAuthorizationRequest {
    let json = try requestJSON(from: call)
    let challenge = try bytes(json["challenge"] as? String, field: "challenge")
    let rpId = json["rpId"] as? String ?? ""
    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
    let request = provider.createCredentialAssertionRequest(challenge: challenge)
    request.userVerificationPreference = .required
    if let allowed = json["allowCredentials"] as? [[String: Any]] {
      request.allowedCredentials = allowed.compactMap { item in
        guard let id = item["id"] as? String, let data = Data(base64URLEncoded: id) else { return nil }
        return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: data)
      }
    }
    return request
  }

  private func registrationRequest(from call: FlutterMethodCall) throws -> ASAuthorizationRequest {
    let json = try requestJSON(from: call)
    let challenge = try bytes(json["challenge"] as? String, field: "challenge")
    let rp = json["rp"] as? [String: Any] ?? [:]
    let user = json["user"] as? [String: Any] ?? [:]
    let rpId = rp["id"] as? String ?? ""
    let userId = try bytes(user["id"] as? String, field: "user.id")
    let name = user["name"] as? String ?? ""
    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
    let request = provider.createCredentialRegistrationRequest(
      challenge: challenge,
      name: name,
      userID: userId
    )
    request.userVerificationPreference = .required
    if #available(iOS 16.0, *),
       let selection = json["authenticatorSelection"] as? [String: Any],
       let resident = selection["residentKey"] as? String,
       resident == "required" || resident == "preferred" {
      request.residentKeyPreference = .required
    }
    return request
  }

  private func requestJSON(from call: FlutterMethodCall) throws -> [String: Any] {
    guard
      let arguments = call.arguments as? [String: Any],
      let raw = arguments["requestJson"] as? String,
      let data = raw.data(using: .utf8),
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      throw NSError(domain: "finverse.passkeys", code: 1, userInfo: [NSLocalizedDescriptionKey: "A passkey challenge is required."])
    }
    return json
  }

  private func bytes(_ value: String?, field: String) throws -> Data {
    guard let value, !value.isEmpty, let data = Data(base64URLEncoded: value) else {
      throw NSError(domain: "finverse.passkeys", code: 2, userInfo: [NSLocalizedDescriptionKey: "Missing \(field)."])
    }
    return data
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    defer { pending = nil }
    if let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion {
      pending?([
        "id": credential.credentialID.base64URLEncodedString(),
        "clientDataJson": credential.rawClientDataJSON.base64URLEncodedString(),
        "authenticatorData": credential.rawAuthenticatorData.base64URLEncodedString(),
        "signature": credential.signature.base64URLEncodedString(),
      ])
      return
    }
    if let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration {
      pending?([
        "id": credential.credentialID.base64URLEncodedString(),
        "clientDataJson": credential.rawClientDataJSON.base64URLEncodedString(),
        "attestationObject": credential.rawAttestationObject?.base64URLEncodedString() ?? "",
      ])
      return
    }
    pending?(FlutterError(code: "NO_CREDENTIAL", message: "No passkey was selected.", details: nil))
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    defer { pending = nil }
    let nsError = error as NSError
    if nsError.domain == ASAuthorizationError.errorDomain && nsError.code == ASAuthorizationError.canceled.rawValue {
      pending?(FlutterError(code: "CANCELLED", message: "Passkey verification was cancelled.", details: nil))
      return
    }
    pending?(FlutterError(code: "FAILED", message: error.localizedDescription, details: nil))
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    presenter()?.view.window ?? ASPresentationAnchor()
  }
}

private extension Data {
  init?(base64URLEncoded value: String) {
    var normalized = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    let remainder = normalized.count % 4
    if remainder > 0 {
      normalized.append(String(repeating: "=", count: 4 - remainder))
    }
    self.init(base64Encoded: normalized)
  }

  func base64URLEncodedString() -> String {
    base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
