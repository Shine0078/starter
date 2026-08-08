import 'package:flutter/material.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({required this.onComplete, super.key});

  final Future<void> Function() onComplete;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  var _page = 0;
  var _finishing = false;

  static const _pages = [
    (
      icon: Icons.account_balance_wallet_outlined,
      title: 'See your money clearly',
      detail:
          'Bring accounts and transactions into one private view, then understand where every dollar is going.',
    ),
    (
      icon: Icons.track_changes_outlined,
      title: 'Turn plans into progress',
      detail:
          'Set budgets and savings goals, monitor subscriptions, and get useful alerts before small problems grow.',
    ),
    (
      icon: Icons.security_outlined,
      title: 'Connect without sharing credentials',
      detail:
          'Plaid handles bank sign-in. FINVERSE never receives your bank password and encrypts provider access tokens.',
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    if (_finishing) return;
    setState(() => _finishing = true);
    await widget.onComplete();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          actions: [
            TextButton(
              onPressed: _finishing ? null : _finish,
              child: const Text('Skip'),
            ),
          ],
        ),
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: PageView.builder(
                  controller: _controller,
                  itemCount: _pages.length,
                  onPageChanged: (page) => setState(() => _page = page),
                  itemBuilder: (context, index) {
                    final page = _pages[index];
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 32),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(28),
                            decoration: BoxDecoration(
                              color: Theme.of(context)
                                  .colorScheme
                                  .primaryContainer,
                              shape: BoxShape.circle,
                            ),
                            child: Icon(page.icon, size: 64),
                          ),
                          const SizedBox(height: 32),
                          Text(
                            page.title,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                          const SizedBox(height: 14),
                          Text(
                            page.detail,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  _pages.length,
                  (index) => AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: index == _page ? 24 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: index == _page
                          ? Theme.of(context).colorScheme.primary
                          : Theme.of(context).colorScheme.outlineVariant,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(24),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _finishing
                        ? null
                        : () {
                            if (_page == _pages.length - 1) {
                              _finish();
                            } else {
                              _controller.nextPage(
                                duration: const Duration(milliseconds: 240),
                                curve: Curves.easeOut,
                              );
                            }
                          },
                    child: Text(_page == _pages.length - 1
                        ? 'Get started'
                        : 'Continue'),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}
