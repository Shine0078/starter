package com.finverse.finance

import android.app.Activity
import android.util.Base64
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.NoCredentialException
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONObject

class PasskeyChannel(private val activity: Activity) : MethodChannel.MethodCallHandler {
    private val manager = CredentialManager.create(activity)
    private val scope = CoroutineScope(Dispatchers.Main + Job())
    private var inFlight: Job? = null

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "authenticate" -> start(result) { authenticate(call, result) }
            "register" -> start(result) { register(call, result) }
            else -> result.notImplemented()
        }
    }

    private fun start(result: MethodChannel.Result, block: suspend () -> Unit) {
        if (inFlight?.isActive == true) {
            result.error("BUSY", "A passkey ceremony is already in progress.", null)
            return
        }
        inFlight = scope.launch {
            try {
                block()
            } catch (error: GetCredentialCancellationException) {
                result.error("CANCELLED", "Passkey verification was cancelled.", null)
            } catch (error: CreateCredentialCancellationException) {
                result.error("CANCELLED", "Passkey creation was cancelled.", null)
            } catch (error: NoCredentialException) {
                result.error("NO_CREDENTIAL", "No passkey was selected.", null)
            } catch (error: GetCredentialProviderConfigurationException) {
                result.error("UNAVAILABLE", "Passkeys are not available on this device.", null)
            } catch (error: Exception) {
                result.error("FAILED", error.message ?: "Could not complete this passkey ceremony.", null)
            } finally {
                inFlight = null
            }
        }
    }

    private suspend fun authenticate(call: MethodCall, result: MethodChannel.Result) {
        val requestJson = call.argument<String>("requestJson")
        if (requestJson.isNullOrBlank()) {
            result.error("INVALID_REQUEST", "A passkey challenge is required.", null)
            return
        }
        val response = manager.getCredential(
            context = activity,
            request = GetCredentialRequest(listOf(GetPublicKeyCredentialOption(requestJson))),
        )
        val credential = response.credential as? PublicKeyCredential
        if (credential == null) {
            result.error("NO_CREDENTIAL", "No passkey was selected.", null)
            return
        }
        result.success(assertionPayload(credential.authenticationResponseJson))
    }

    private suspend fun register(call: MethodCall, result: MethodChannel.Result) {
        val requestJson = call.argument<String>("requestJson")
        if (requestJson.isNullOrBlank()) {
            result.error("INVALID_REQUEST", "A passkey challenge is required.", null)
            return
        }
        val response = manager.createCredential(
            context = activity,
            request = CreatePublicKeyCredentialRequest(requestJson),
        ) as CreatePublicKeyCredentialResponse
        result.success(attestationPayload(response.registrationResponseJson))
    }

    private fun assertionPayload(raw: String): Map<String, String> {
        val json = JSONObject(raw)
        val response = json.getJSONObject("response")
        return mapOf(
            "id" to json.optString("id").ifEmpty { json.getString("rawId") },
            "clientDataJson" to toUrl(response.getString("clientDataJSON")),
            "authenticatorData" to toUrl(response.getString("authenticatorData")),
            "signature" to toUrl(response.getString("signature")),
        )
    }

    private fun attestationPayload(raw: String): Map<String, String> {
        val json = JSONObject(raw)
        val response = json.getJSONObject("response")
        return mapOf(
            "id" to json.optString("id").ifEmpty { json.getString("rawId") },
            "clientDataJson" to toUrl(response.getString("clientDataJSON")),
            "attestationObject" to toUrl(response.getString("attestationObject")),
        )
    }

    private fun toUrl(value: String): String {
        val decoded = try {
            Base64.decode(value, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        } catch (_: IllegalArgumentException) {
            Base64.decode(value, Base64.DEFAULT)
        }
        return Base64.encodeToString(decoded, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }
}
