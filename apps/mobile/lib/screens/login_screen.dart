import 'package:flutter/material.dart';

import '../api/client.dart';

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
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final email = _email.text.trim();
      if (_registering) {
        await widget.api.register(email, _password.text);
      } else if (_recovering) {
        await widget.api.cancelAccountDeletion(email, _password.text);
      } else {
        await widget.api.signIn(email, _password.text);
      }
      if (!mounted) return;
      widget.onSignedIn();
    } on AuthException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.displayMessage);
    } catch (error) {
      if (!mounted) return;
      setState(
          () => _error = "Couldn't reach the server. Check your connection.");
      debugPrint('Sign-in failed: $error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resetPassword() async {
    final email = TextEditingController(text: _email.text.trim());
    final requested = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Reset password'),
        content: TextField(
          controller: email,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(
            labelText: 'Email',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(email.text.trim()),
            child: const Text('Send reset code'),
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
      setState(
          () => _error = "Couldn't reach the server. Check your connection.");
      return;
    }
    if (!mounted) return;

    final token = TextEditingController();
    final nextPassword = TextEditingController();
    final values = await showDialog<List<String>>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Enter your reset code'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
                'If an account exists, a one-hour reset code has been sent.'),
            const SizedBox(height: 12),
            TextField(
              controller: token,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'Reset code',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: nextPassword,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'New password (12+ characters)',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Later'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop([
              token.text.trim(),
              nextPassword.text,
            ]),
            child: const Text('Set new password'),
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
        const SnackBar(content: Text('Password updated. You can sign in now.')),
      );
    } on AuthException catch (error) {
      if (mounted) setState(() => _error = error.displayMessage);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

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
                          ? 'Create your account'
                          : _recovering
                              ? 'Restore your account'
                              : 'Welcome back',
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
                      decoration: const InputDecoration(
                        labelText: 'Email',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.mail_outline),
                      ),
                      validator: (value) {
                        final text = value?.trim() ?? '';
                        if (text.isEmpty) return 'Enter your email address.';
                        if (!text.contains('@') || !text.contains('.')) {
                          return 'Enter a valid email address.';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _password,
                      obscureText: _obscure,
                      autofillHints: [
                        _registering
                            ? AutofillHints.newPassword
                            : AutofillHints.password,
                      ],
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _busy ? null : _submit(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        border: const OutlineInputBorder(),
                        prefixIcon: const Icon(Icons.lock_outline),
                        helperText:
                            _registering ? 'At least 12 characters' : null,
                        suffixIcon: IconButton(
                          icon: Icon(_obscure
                              ? Icons.visibility_off
                              : Icons.visibility),
                          tooltip: _obscure ? 'Show password' : 'Hide password',
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: (value) {
                        if ((value ?? '').isEmpty) {
                          return 'Enter your password.';
                        }
                        // Only enforced client-side when registering. Blocking a
                        // short password at sign-in would tell someone their
                        // guess was malformed rather than simply wrong.
                        if (_registering && value!.length < 12) {
                          return 'Use at least 12 characters.';
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
                      onPressed: _busy ? null : _submit,
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
                                  ? 'Create account'
                                  : _recovering
                                      ? 'Restore account'
                                      : 'Sign in',
                            ),
                    ),
                    if (!_registering && !_recovering)
                      TextButton(
                        onPressed: _busy ? null : _resetPassword,
                        child: const Text('Forgot password?'),
                      ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                                _registering = !_registering;
                                _recovering = false;
                                _error = null;
                              }),
                      child: Text(
                        _registering
                            ? 'I already have an account'
                            : 'Create an account',
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
                              ? 'Back to sign in'
                              : 'Cancel scheduled account deletion',
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
