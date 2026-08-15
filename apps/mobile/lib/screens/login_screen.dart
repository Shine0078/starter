import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/client.dart';
import '../api/session_store.dart';
import '../l10n/app_localizations.dart';
import '../l10n/app_localizations_en.dart';
import '../models/models.dart';

/// Isolated embedders (including authentication tests) may not install the
/// app's localization delegates. Keep the sign-in path usable in English
/// rather than failing before a user can recover their account.
AppLocalizations _localizations(BuildContext context) {
  return Localizations.of<AppLocalizations>(context, AppLocalizations) ??
      AppLocalizationsEn();
}

/// Sign in or create an account.
///
/// Password rules are shown up front rather than only after a rejection: this
/// app requires a 12-character minimum, which surprises people used to eight,
/// and discovering it by failing is a poor first impression.
class LoginScreen extends StatefulWidget {
  const LoginScreen({required this.api, required this.onSignedIn, super.key});

  final ApiClient api;
  final VoidCallback onSignedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();

  bool _registering = false;
  bool _recovering = false;
  bool _busy = false;
  bool _obscure = true;
  bool _legalLoading = false;
  bool _acceptedTerms = false;
  bool _acceptedPrivacyNotice = false;
  LegalPolicies? _legal;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_registering && _legal == null) {
      setState(() => _error = _localizations(context).loginLegalUnavailable);
      return;
    }
    if (_registering &&
        _legal!.registrationRequired &&
        (!_acceptedTerms || !_acceptedPrivacyNotice)) {
      setState(() => _error = _localizations(context).loginAcceptLegal);
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final email = _email.text.trim();
      if (_registering) {
        await widget.api.register(
          email,
          _password.text,
          policies: _legal!,
          acceptedTerms: _acceptedTerms,
          acceptedPrivacyNotice: _acceptedPrivacyNotice,
        );
      } else if (_recovering) {
        await widget.api.cancelAccountDeletion(email, _password.text);
      } else {
        await widget.api.signIn(email, _password.text);
      }
      if (!mounted) return;
      widget.onSignedIn();
    } on MfaRequiredException catch (challenge) {
      if (!mounted) return;
      var code = '';
      final submitted = await showDialog<String>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          title: Text(_localizations(context).loginMfaTitle),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_localizations(context).loginMfaDetail),
              const SizedBox(height: 16),
              TextField(
                onChanged: (value) => code = value,
                autofocus: true,
                autocorrect: false,
                textInputAction: TextInputAction.done,
                decoration: InputDecoration(
                  labelText: _localizations(context).loginMfaCode,
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(_localizations(context).commonCancel),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, code.trim()),
              child: Text(_localizations(context).commonVerify),
            ),
          ],
        ),
      );
      if (submitted == null || submitted.isEmpty || !mounted) return;
      try {
        await widget.api.verifyMfa(challenge.challengeToken, submitted);
        if (mounted) {
          widget.onSignedIn();
        }
      } on AuthException catch (error) {
        if (mounted) {
          setState(() => _error = error.displayMessage);
        }
      } on SessionStoreUnavailableException {
        if (mounted) {
          setState(() =>
              _error = _localizations(context).loginSessionPersistenceFailed);
        }
      } catch (error) {
        if (mounted) {
          setState(() => _error = _localizations(context).loginMfaFailed);
        }
      }
    } on AuthException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.displayMessage);
    } on SessionStoreUnavailableException {
      if (!mounted) return;
      setState(
          () => _error = _localizations(context).loginSessionPersistenceFailed);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = widget.api.connectionFailureMessage);
      debugPrint('Sign-in failed: $error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggleRegistration() async {
    final entering = !_registering;
    setState(() {
      _registering = entering;
      _recovering = false;
      _error = null;
      _legal = null;
      _legalLoading = entering;
      _acceptedTerms = false;
      _acceptedPrivacyNotice = false;
    });
    if (!entering) return;

    try {
      final legal = await widget.api.legalPolicies();
      if (legal.registrationRequired &&
          (legal.terms == null || legal.privacyNotice == null)) {
        throw const FormatException(
            'Required legal document metadata is incomplete.');
      }
      if (!mounted || !_registering) return;
      setState(() {
        _legal = legal;
        _legalLoading = false;
      });
    } catch (error) {
      if (!mounted || !_registering) return;
      setState(() {
        _legalLoading = false;
        _error = _localizations(context).loginLegalLoadFailed;
      });
      debugPrint('Legal policy load failed: $error');
    }
  }

  Future<void> _openLegal(LegalDocumentPolicy document) async {
    final opened = await launchUrl(
      Uri.parse(document.url),
      mode: LaunchMode.externalApplication,
    );
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_localizations(context).loginOpenLegalFailed)),
      );
    }
  }

  Future<void> _resetPassword() async {
    final email = TextEditingController(text: _email.text.trim());
    final requested = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_localizations(context).loginResetTitle),
        content: TextField(
          controller: email,
          keyboardType: TextInputType.emailAddress,
          decoration: InputDecoration(
            labelText: _localizations(context).emailLabel,
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(_localizations(context).commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(email.text.trim()),
            child: Text(_localizations(context).loginResetSend),
          ),
        ],
      ),
    );
    email.dispose();
    if (requested == null || requested.isEmpty || !mounted) return;

    try {
      await widget.api.requestPasswordReset(requested);
    } on AuthException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.displayMessage);
      return;
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _localizations(context).errorConnection);
      return;
    }
    if (!mounted) return;

    final token = TextEditingController();
    final nextPassword = TextEditingController();
    final values = await showDialog<List<String>>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_localizations(context).loginResetCodeTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_localizations(context).loginResetSent),
            const SizedBox(height: 12),
            TextField(
              controller: token,
              autocorrect: false,
              decoration: InputDecoration(
                labelText: _localizations(context).loginResetCode,
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: nextPassword,
              obscureText: true,
              decoration: InputDecoration(
                labelText: _localizations(context).loginNewPassword,
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(_localizations(context).loginLater),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop([
              token.text.trim(),
              nextPassword.text,
            ]),
            child: Text(_localizations(context).loginSetNewPassword),
          ),
        ],
      ),
    );
    token.dispose();
    nextPassword.dispose();
    if (values == null || !mounted) return;

    try {
      await widget.api.confirmPasswordReset(values[0], values[1]);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_localizations(context).loginPasswordUpdated)),
      );
    } on AuthException catch (error) {
      if (mounted) setState(() => _error = error.displayMessage);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = _localizations(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'FINVERSE',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        letterSpacing: 2,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _registering
                          ? l10n.loginCreateAccountHeading
                          : _recovering
                              ? l10n.loginRestoreAccountHeading
                              : l10n.loginWelcomeBack,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 28),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      autofillHints: const [AutofillHints.email],
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: l10n.emailLabel,
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.mail_outline),
                      ),
                      validator: (value) {
                        final text = value?.trim() ?? '';
                        if (text.isEmpty) return l10n.loginEmailRequired;
                        if (!text.contains('@') || !text.contains('.')) {
                          return l10n.loginEmailInvalid;
                        }
                        return null;
                      },
                    ),
                    if (_registering && _legalLoading) ...[
                      const SizedBox(height: 14),
                      const LinearProgressIndicator(),
                      const SizedBox(height: 8),
                      Text(l10n.loginLegalLoading),
                    ],
                    if (_registering &&
                        _legal?.registrationRequired == true) ...[
                      const SizedBox(height: 10),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        value: _acceptedTerms,
                        onChanged: _busy
                            ? null
                            : (value) =>
                                setState(() => _acceptedTerms = value ?? false),
                        title: Text(l10n.loginAcceptTerms),
                        subtitle: Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton(
                            onPressed: () => _openLegal(_legal!.terms!),
                            child: Text(
                              l10n.loginReadTerms(_legal!.terms!.version),
                            ),
                          ),
                        ),
                      ),
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        value: _acceptedPrivacyNotice,
                        onChanged: _busy
                            ? null
                            : (value) => setState(
                                () => _acceptedPrivacyNotice = value ?? false),
                        title: Text(l10n.loginAcknowledgePrivacy),
                        subtitle: Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton(
                            onPressed: () => _openLegal(_legal!.privacyNotice!),
                            child: Text(
                              l10n.loginReadPrivacy(
                                  _legal!.privacyNotice!.version),
                            ),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _password,
                      obscureText: _obscure,
                      // iOS Safari's password AutoFill intercepts Flutter
                      // web's hidden password input and never raises the
                      // keyboard. Autofill stays enabled for the native apps,
                      // where the platform text field handles it correctly.
                      autofillHints: kIsWeb
                          ? null
                          : [
                              _registering
                                  ? AutofillHints.newPassword
                                  : AutofillHints.password,
                            ],
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _busy ? null : _submit(),
                      decoration: InputDecoration(
                        labelText: l10n.passwordLabel,
                        border: const OutlineInputBorder(),
                        prefixIcon: const Icon(Icons.lock_outline),
                        helperText:
                            _registering ? l10n.loginPasswordHelper : null,
                        suffixIcon: IconButton(
                          icon: Icon(_obscure
                              ? Icons.visibility_off
                              : Icons.visibility),
                          tooltip: _obscure
                              ? l10n.loginShowPassword
                              : l10n.loginHidePassword,
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: (value) {
                        if ((value ?? '').isEmpty) {
                          return l10n.loginPasswordRequired;
                        }
                        // Only enforced client-side when registering. Blocking a
                        // short password at sign-in would tell someone their
                        // guess was malformed rather than simply wrong.
                        if (_registering && value!.length < 12) {
                          return l10n.loginPasswordMinimum;
                        }
                        return null;
                      },
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.errorContainer,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.error_outline,
                                size: 18,
                                color: theme.colorScheme.onErrorContainer),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _error!,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: theme.colorScheme.onErrorContainer,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy ||
                              (_registering &&
                                  (_legalLoading ||
                                      _legal == null ||
                                      (_legal!.registrationRequired &&
                                          (!_acceptedTerms ||
                                              !_acceptedPrivacyNotice))))
                          ? null
                          : _submit,
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      child: _busy
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(
                              _registering
                                  ? l10n.registerAction
                                  : _recovering
                                      ? l10n.loginRestoreAction
                                      : l10n.signInAction,
                            ),
                    ),
                    if (!_registering && !_recovering)
                      TextButton(
                        onPressed: _busy ? null : _resetPassword,
                        child: Text(l10n.loginForgotPassword),
                      ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _busy ? null : _toggleRegistration,
                      child: Text(
                        _registering
                            ? l10n.loginAlreadyHaveAccount
                            : l10n.loginCreateAccountPrompt,
                      ),
                    ),
                    if (!_registering)
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => setState(() {
                                  _recovering = !_recovering;
                                  _error = null;
                                }),
                        child: Text(
                          _recovering
                              ? l10n.loginBackToSignIn
                              : l10n.loginCancelDeletion,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
