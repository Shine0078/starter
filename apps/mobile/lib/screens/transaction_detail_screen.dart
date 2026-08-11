import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api/client.dart';
import '../api/receipt_photo_recognizer.dart';
import '../l10n/app_localizations.dart';
import '../models/models.dart';

enum _ReceiptInputMethod { photo, paste }

class TransactionDetailScreen extends StatefulWidget {
  const TransactionDetailScreen({
    required this.api,
    required this.transaction,
    super.key,
  });

  final ApiClient api;
  final Transaction transaction;

  @override
  State<TransactionDetailScreen> createState() =>
      _TransactionDetailScreenState();
}

class _TransactionDetailScreenState extends State<TransactionDetailScreen> {
  List<CategoryDefinition> _categories = const [];
  late String _category;
  late String _merchantOverride;
  late String _note;
  late bool _excludedFromAnalytics;
  late bool _isRecurring;
  late bool? _recurringOverride;
  late bool _duplicateReported;
  ReceiptRecord? _receipt;
  var _saving = false;
  final _receiptPhotoRecognizer = ReceiptPhotoRecognizer();
  final _imagePicker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _category = widget.transaction.categorySlug;
    _merchantOverride = widget.transaction.merchantOverride ?? '';
    _note = widget.transaction.note ?? '';
    _excludedFromAnalytics = widget.transaction.excludedFromAnalytics;
    _isRecurring = widget.transaction.isRecurring;
    _recurringOverride = widget.transaction.recurringOverride;
    _duplicateReported = widget.transaction.duplicateReported;
    _loadCategories();
    _loadReceipt();
  }

  Future<void> _loadReceipt() async {
    try {
      final receipt =
          await widget.api.receiptForTransaction(widget.transaction.id);
      if (mounted) setState(() => _receipt = receipt);
    } catch (_) {
      // Receipts are additive context; an outage must not hide the details.
    }
  }

  Future<void> _loadCategories() async {
    widget.api.resetOfflineStatus();
    try {
      final categories = await widget.api.categories();
      if (!mounted) return;
      setState(() {
        _categories = categories
            .where((category) =>
                category.parent != null ||
                category.slug == _category ||
                category.slug == 'transfer')
            .toList()
          ..sort((a, b) => a.name.compareTo(b.name));
      });
    } catch (_) {
      // Details remain useful if the static category reference cannot load.
    }
  }

  Future<void> _saveCategory(String slug) async {
    final previous = _category;
    setState(() {
      _category = slug;
      _saving = true;
    });
    try {
      final message =
          await widget.api.recategorize(widget.transaction.id, slug);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    } catch (error) {
      if (!mounted) return;
      setState(() => _category = previous);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _editText({required bool note}) async {
    final controller =
        TextEditingController(text: note ? _note : _merchantOverride);
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(note ? 'Add a note' : 'Rename merchant'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: note ? 2000 : 120,
          maxLines: note ? 5 : 1,
          decoration: InputDecoration(
            hintText: note
                ? 'Only you can see this note'
                : 'Your local merchant name',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (!mounted || value == null) return;
    setState(() => _saving = true);
    try {
      final updated = await widget.api.updateTransactionPreferences(
        widget.transaction.id,
        merchantOverride: note ? null : value,
        note: note ? value : null,
      );
      if (!mounted) return;
      setState(() {
        _merchantOverride = updated.merchantOverride ?? '';
        _note = updated.note ?? '';
      });
    } catch (error) {
      if (mounted) {
        if (error is OfflineMutationQueuedException) {
          setState(() {
            if (note) {
              _note = value;
            } else {
              _merchantOverride = value;
            }
          });
        }
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleExcluded(bool value) async {
    final previous = _excludedFromAnalytics;
    setState(() {
      _excludedFromAnalytics = value;
      _saving = true;
    });
    try {
      final updated = await widget.api.updateTransactionPreferences(
        widget.transaction.id,
        excludedFromAnalytics: value,
      );
      if (mounted) {
        setState(() => _excludedFromAnalytics = updated.excludedFromAnalytics);
      }
    } catch (error) {
      if (mounted) {
        if (error is! OfflineMutationQueuedException) {
          setState(() => _excludedFromAnalytics = previous);
        }
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleRecurring(bool value) async {
    final previous = _isRecurring;
    final previousOverride = _recurringOverride;
    setState(() {
      _isRecurring = value;
      _recurringOverride = value;
      _saving = true;
    });
    try {
      final updated = await widget.api.updateTransactionPreferences(
        widget.transaction.id,
        isRecurring: value,
      );
      if (mounted) {
        setState(() {
          _isRecurring = updated.isRecurring;
          _recurringOverride = updated.recurringOverride;
        });
      }
    } catch (error) {
      if (mounted) {
        if (error is! OfflineMutationQueuedException) {
          setState(() {
            _isRecurring = previous;
            _recurringOverride = previousOverride;
          });
        }
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _toggleDuplicateReported(bool value) async {
    final previous = _duplicateReported;
    setState(() {
      _duplicateReported = value;
      _saving = true;
    });
    try {
      final updated = await widget.api.updateTransactionPreferences(
        widget.transaction.id,
        duplicateReported: value,
      );
      if (mounted) {
        setState(() => _duplicateReported = updated.duplicateReported);
      }
    } catch (error) {
      if (mounted) {
        if (error is! OfflineMutationQueuedException) {
          setState(() => _duplicateReported = previous);
        }
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _markTransfer() async {
    if (_category == 'transfer' || _saving) return;
    final previous = _category;
    setState(() {
      _category = 'transfer';
      _saving = true;
    });
    try {
      await widget.api.recategorize(
        widget.transaction.id,
        'transfer',
        createRule: false,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Marked as a transfer.')),
        );
      }
    } catch (error) {
      if (mounted) {
        setState(() => _category = previous);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Scan a local photo or paste receipt text, let the person review the
  /// transcript, then attach only that text and its parsed fields. The image
  /// itself never goes through the API.
  Future<void> _attachReceipt() async {
    final l10n = AppLocalizations.of(context);
    final method = await showModalBottomSheet<_ReceiptInputMethod>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (ReceiptPhotoRecognizer.isSupported)
              ListTile(
                leading: const Icon(Icons.document_scanner_outlined),
                title: Text(l10n.receiptScanPhoto),
                subtitle: Text(l10n.receiptScanPhotoDetail),
                onTap: () =>
                    Navigator.pop(sheetContext, _ReceiptInputMethod.photo),
              ),
            ListTile(
              leading: const Icon(Icons.paste_outlined),
              title: Text(l10n.receiptPasteText),
              subtitle: Text(l10n.receiptPasteTextDetail),
              onTap: () =>
                  Navigator.pop(sheetContext, _ReceiptInputMethod.paste),
            ),
          ],
        ),
      ),
    );
    if (!mounted || method == null) return;

    String? initialText;
    if (method == _ReceiptInputMethod.photo) {
      initialText = await _scanReceiptPhoto();
      if (!mounted || initialText == null) return;
    }
    final text = await _editReceiptText(initialText: initialText);
    if (!mounted || text == null || text.trim().isEmpty) return;

    setState(() => _saving = true);
    try {
      final receipt = await widget.api.attachReceipt(
        widget.transaction.id,
        text,
      );
      if (!mounted) return;
      setState(() => _receipt = receipt);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(receipt.merchant == null
                ? 'Receipt attached.'
                : 'Receipt attached — ${receipt.merchant}.')),
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(friendlyErrorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<String?> _scanReceiptPhoto() async {
    final l10n = AppLocalizations.of(context);
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: Text(l10n.receiptTakePhoto),
              onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(l10n.receiptChoosePhoto),
              onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (!mounted || source == null) return null;

    final image = await _imagePicker.pickImage(
      source: source,
      maxWidth: 2048,
      imageQuality: 90,
    );
    if (!mounted || image == null) return null;

    setState(() => _saving = true);
    try {
      return await _receiptPhotoRecognizer.recognizeFile(image.path);
    } on ReceiptPhotoRecognitionException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
      return null;
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<String?> _editReceiptText({String? initialText}) async {
    final l10n = AppLocalizations.of(context);
    final controller = TextEditingController(text: initialText ?? '');
    final text = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(initialText == null
            ? l10n.receiptAttachAction
            : l10n.receiptReviewScanned),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              initialText == null
                  ? l10n.receiptPasteExplanation
                  : l10n.receiptReviewExplanation,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              maxLines: 6,
              maxLength: 8000,
              decoration: const InputDecoration(
                hintText:
                    'Blue Bottle Coffee\nCappuccino 4.50\nTotal Due 11.42',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: Text(l10n.receiptAttachAction),
          ),
        ],
      ),
    );
    controller.dispose();
    return text;
  }

  @override
  Widget build(BuildContext context) {
    final transaction = widget.transaction;
    return Scaffold(
      appBar: AppBar(title: const Text('Transaction details')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 28,
                  child: Icon(transaction.amount < 0
                      ? Icons.shopping_bag_outlined
                      : Icons.south_west),
                ),
                const SizedBox(height: 12),
                Text(
                  transaction.displayName,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 4),
                Text(
                  transaction.amountFormatted,
                  style: Theme.of(context)
                      .textTheme
                      .headlineMedium
                      ?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text('${transaction.postedAt} • ${transaction.currency}'),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Category',
                      style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 8),
                  if (_categories.isEmpty)
                    Text(_category.replaceAll('_', ' '))
                  else
                    DropdownButtonFormField<String>(
                      initialValue: _category,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                      ),
                      items: _categories
                          .map((category) => DropdownMenuItem(
                                value: category.slug,
                                child: Text(category.name),
                              ))
                          .toList(),
                      onChanged: _saving
                          ? null
                          : (value) {
                              if (value != null && value != _category) {
                                _saveCategory(value);
                              }
                            },
                    ),
                  const SizedBox(height: 8),
                  Text(_categoryExplanation(transaction)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                _detail('Bank description', transaction.rawDescriptor),
                _detail('Normalized name', transaction.normalizedDescriptor),
                _detail('Status', transaction.pending ? 'Pending' : 'Posted'),
                _detail(
                  'Recurring',
                  _isRecurring
                      ? (_recurringOverride == null
                          ? 'Yes · detected from history'
                          : 'Yes · marked by you')
                      : (_recurringOverride == null
                          ? 'No · not detected'
                          : 'No · marked by you'),
                ),
                _detail('Account reference', transaction.accountId),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.storefront_outlined),
                  title: Text(_merchantOverride.isEmpty
                      ? 'Rename merchant'
                      : _merchantOverride),
                  subtitle: Text(_merchantOverride.isEmpty
                      ? 'Use a name that makes sense to you'
                      : 'Local name; bank description is preserved below'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: _saving ? null : () => _editText(note: false),
                ),
                ListTile(
                  leading: const Icon(Icons.notes_outlined),
                  title: Text(_note.isEmpty ? 'Add a note' : 'Edit note'),
                  subtitle: Text(_note.isEmpty
                      ? 'Private context for this transaction'
                      : _note),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: _saving ? null : () => _editText(note: true),
                ),
                if (_category != 'transfer')
                  ListTile(
                    leading: const Icon(Icons.swap_horiz),
                    title: const Text('Mark as transfer'),
                    subtitle: const Text(
                      'Exclude money moved between accounts from income and spending',
                    ),
                    onTap: _saving ? null : _markTransfer,
                  ),
                SwitchListTile.adaptive(
                  secondary: const Icon(Icons.autorenew),
                  title: const Text('Mark as recurring'),
                  subtitle: Text(_recurringOverride == null
                      ? 'Override the history-based detector for this transaction'
                      : 'Your choice is kept across future bank syncs'),
                  value: _isRecurring,
                  onChanged: _saving ? null : _toggleRecurring,
                ),
                SwitchListTile.adaptive(
                  secondary: const Icon(Icons.report_gmailerrorred_outlined),
                  title: const Text('Flag possible duplicate'),
                  subtitle: Text(_duplicateReported
                      ? 'Kept as a review marker; the transaction remains in your ledger'
                      : 'Mark this charge for your own follow-up'),
                  value: _duplicateReported,
                  onChanged: _saving ? null : _toggleDuplicateReported,
                ),
                SwitchListTile.adaptive(
                  secondary: const Icon(Icons.visibility_off_outlined),
                  title: const Text('Exclude from analytics'),
                  subtitle: const Text(
                    'Keep the transaction, but omit it from totals and alerts',
                  ),
                  value: _excludedFromAnalytics,
                  onChanged: _saving ? null : _toggleExcluded,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ListTile(
                  leading: const Icon(Icons.receipt_long_outlined),
                  title: Text(_receipt == null
                      ? 'Attach a receipt'
                      : 'Receipt · ${_receipt!.merchant ?? 'attached'}'),
                  subtitle: Text(_receipt == null
                      ? 'Keep the store copy and parse the total'
                      : _receiptSummary()),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: _saving ? null : _attachReceipt,
                ),
                if (_receipt != null &&
                    (_receipt!.totalMinor != null ||
                        _receipt!.items.isNotEmpty))
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Text(
                      _receiptLines(),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Changing the category also teaches FINVERSE how to classify matching transactions from this merchant.',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  String _receiptSummary() {
    final receipt = _receipt!;
    final totalMinor = receipt.totalMinor;
    final total =
        totalMinor == null ? null : (totalMinor / 100).toStringAsFixed(2);
    final parts = <String>[
      if (receipt.receiptDate != null) receipt.receiptDate!,
      if (total != null)
        'Total ${receipt.currency == null ? '' : '${receipt.currency} '}$total',
    ];
    return parts.isEmpty ? 'Receipt attached' : parts.join(' · ');
  }

  String _receiptLines() {
    final receipt = _receipt!;
    final lines = <String>[...receipt.items];
    final totalMinor = receipt.totalMinor;
    final total =
        totalMinor == null ? null : (totalMinor / 100).toStringAsFixed(2);
    if (total != null) {
      lines.add(
          'Total ${receipt.currency == null ? '' : '${receipt.currency} '}$total');
    }
    return lines.take(14).join('\n');
  }

  Widget _detail(String label, String value) => ListTile(
        title: Text(label),
        subtitle: SelectableText(value.isEmpty ? 'Unavailable' : value),
      );

  /// Every category must be able to say why it is what it is (ADR-0004), and
  /// "suggested by transfer pairing" is provenance, not an explanation.
  String _categoryExplanation(Transaction transaction) {
    if (transaction.isUserSet) return 'Chosen by you.';
    if (transaction.needsReview) return 'FINVERSE needs your review.';

    if (transaction.categorySource == 'transfer_pairing') {
      return 'Matched to the opposite side of this amount in another of your '
          'accounts, so it is money you moved rather than income or spending. '
          'It is left out of your totals.';
    }

    final percent = (transaction.categoryConfidence * 100).round();
    if (transaction.categorySource == 'lexicon') {
      return 'Recognised from the merchant name • $percent% confidence.';
    }
    if (transaction.categorySource == 'model') {
      return AppLocalizations.of(context).categoryExplanationLearned(percent);
    }
    return 'Suggested by ${transaction.categorySource.replaceAll('_', ' ')} • $percent% confidence.';
  }
}
