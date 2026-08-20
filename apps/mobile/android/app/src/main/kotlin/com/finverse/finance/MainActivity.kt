package com.finverse.finance

import android.net.Uri
import androidx.activity.result.ActivityResultLauncher
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.plaid.link.OpenPlaidLink
import com.plaid.link.Plaid
import com.plaid.link.PlaidSession
import com.plaid.link.configuration.linkTokenConfiguration
import com.plaid.link.result.LinkExit
import com.plaid.link.result.LinkResult
import com.plaid.link.result.LinkSuccess
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterFragmentActivity() {
    private var pendingCall: MethodChannel.Result? = null
    private var cachedResult: Map<String, Any?>? = null

    // Register as an Activity field so Android can re-deliver an OAuth result
    // after the Activity is recreated.
    private val openPlaidLink: ActivityResultLauncher<PlaidSession> =
        registerForActivityResult(OpenPlaidLink()) { deliver(it) }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, PLAID_CHANNEL)
            .setMethodCallHandler(::handlePlaidCall)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, RECEIPT_VISION_CHANNEL)
            .setMethodCallHandler(::handleReceiptVisionCall)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, PASSKEY_CHANNEL)
            .setMethodCallHandler(PasskeyChannel(this))
    }

    private fun handlePlaidCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "open" -> {
                if (pendingCall != null) {
                    result.error("LINK_ALREADY_OPEN", "Plaid Link is already open.", null)
                    return
                }
                val token = call.argument<String>("token")
                if (token.isNullOrBlank()) {
                    result.error("INVALID_LINK_TOKEN", "A Link token is required.", null)
                    return
                }
                pendingCall = result
                try {
                    val configuration = linkTokenConfiguration { this.token = token }
                    val session = Plaid.createPlaidLinkSession(this, configuration)
                    openPlaidLink.launch(session)
                } catch (error: Exception) {
                    pendingCall = null
                    result.error("LINK_OPEN_FAILED", error.message ?: "Could not open Plaid Link.", null)
                }
            }
            "consumePending" -> {
                result.success(cachedResult)
                cachedResult = null
            }
            else -> result.notImplemented()
        }
    }

    private fun deliver(linkResult: LinkResult) {
        val payload: Map<String, Any?> = when (linkResult) {
            is LinkSuccess -> mapOf(
                "status" to "success",
                "publicToken" to linkResult.publicToken,
                "institutionId" to linkResult.metadata.institution?.id,
                "institutionName" to linkResult.metadata.institution?.name,
                "linkSessionId" to linkResult.metadata.linkSessionId,
            )
            is LinkExit -> mapOf(
                "status" to "exit",
                "errorCode" to linkResult.error?.errorCode?.json,
                "errorMessage" to linkResult.error?.displayMessage,
                "requestId" to linkResult.metadata.requestId,
            )
            else -> mapOf("status" to "exit")
        }
        val callback = pendingCall
        pendingCall = null
        if (callback != null) callback.success(payload) else cachedResult = payload
    }

    /**
     * OCR runs in the Android ML Kit bundled model. Only the text result crosses
     * into Flutter; no image, bitmap, or file path reaches the API layer.
     */
    private fun handleReceiptVisionCall(call: MethodCall, result: MethodChannel.Result) {
        if (call.method != "recognize") {
            result.notImplemented()
            return
        }
        val path = call.argument<String>("path")
        if (path.isNullOrBlank()) {
            result.error("INVALID_IMAGE", "A receipt image is required.", null)
            return
        }
        val file = File(path)
        if (!file.isFile) {
            result.error("INVALID_IMAGE", "The selected receipt image is unavailable.", null)
            return
        }

        val image = try {
            InputImage.fromFilePath(this, Uri.fromFile(file))
        } catch (_: Exception) {
            result.error("INVALID_IMAGE", "The selected receipt image could not be read.", null)
            return
        }
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer.process(image)
            .addOnSuccessListener { recognized ->
                recognizer.close()
                val text = recognized.text.trim()
                when {
                    text.isEmpty() -> result.error("NO_TEXT", "No receipt text found.", null)
                    text.length > MAX_RECEIPT_TEXT -> result.error("TEXT_TOO_LONG", "Receipt text is too long.", null)
                    else -> result.success(text)
                }
            }
            .addOnFailureListener {
                recognizer.close()
                result.error("OCR_FAILED", "Receipt text recognition failed.", null)
            }
    }

    companion object {
        private const val PLAID_CHANNEL = "com.finverse.finance/plaid_link"
        private const val RECEIPT_VISION_CHANNEL = "com.finverse.finance/receipt_vision"
        private const val PASSKEY_CHANNEL = "com.finverse.finance/passkeys"
        private const val MAX_RECEIPT_TEXT = 8000
    }
}
