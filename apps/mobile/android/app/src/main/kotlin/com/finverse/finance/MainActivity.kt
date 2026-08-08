package com.finverse.finance

import androidx.activity.result.ActivityResultLauncher
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

class MainActivity : FlutterFragmentActivity() {
    private var pendingCall: MethodChannel.Result? = null
    private var cachedResult: Map<String, Any?>? = null

    // Register as an Activity field so Android can re-deliver an OAuth result
    // after the Activity is recreated.
    private val openPlaidLink: ActivityResultLauncher<PlaidSession> =
        registerForActivityResult(OpenPlaidLink()) { deliver(it) }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler(::handlePlaidCall)
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

    companion object {
        private const val CHANNEL = "com.finverse.finance/plaid_link"
    }
}
