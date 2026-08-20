import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/platform/shared_preferences_registration.dart';

enum DashboardCard {
  netWorth,
  monthlySummary,
  spending,
  health,
  budgets,
  insights,
  transactions,
}

abstract class DashboardLayoutStore {
  Future<Set<DashboardCard>> readHiddenCards();
  Future<void> writeHiddenCards(Set<DashboardCard> hidden);
}

class SharedPreferencesDashboardLayoutStore implements DashboardLayoutStore {
  SharedPreferencesDashboardLayoutStore({SharedPreferencesAsync? preferences})
      : _preferences = preferences ?? _createPreferences();

  static const _key = 'finverse.dashboard.hidden-cards.v1';
  final SharedPreferencesAsync _preferences;

  static SharedPreferencesAsync _createPreferences() {
    ensureSharedPreferencesAsyncPlatform();
    return SharedPreferencesAsync();
  }

  @override
  Future<Set<DashboardCard>> readHiddenCards() async {
    final raw = await _preferences.getStringList(_key) ?? const <String>[];
    return {
      for (final value in raw)
        if (_parse(value) != null) _parse(value)!,
    };
  }

  @override
  Future<void> writeHiddenCards(Set<DashboardCard> hidden) {
    return _preferences.setStringList(
      _key,
      hidden.map((card) => card.name).toList()..sort(),
    );
  }

  DashboardCard? _parse(String value) {
    for (final card in DashboardCard.values) {
      if (card.name == value) return card;
    }
    return null;
  }
}

class InMemoryDashboardLayoutStore implements DashboardLayoutStore {
  Set<DashboardCard> hidden = {};

  @override
  Future<Set<DashboardCard>> readHiddenCards() async => hidden;

  @override
  Future<void> writeHiddenCards(Set<DashboardCard> hiddenCards) async {
    hidden = {...hiddenCards};
  }
}

class DashboardLayoutController extends ChangeNotifier {
  DashboardLayoutController({DashboardLayoutStore? store})
      : _store = store ?? SharedPreferencesDashboardLayoutStore();

  DashboardLayoutController.inMemory({DashboardLayoutStore? store})
      : _store = store ?? InMemoryDashboardLayoutStore();

  final DashboardLayoutStore _store;
  Set<DashboardCard> _hidden = {};
  var _restored = false;

  Set<DashboardCard> get hidden => _hidden;

  bool isVisible(DashboardCard card) => !_hidden.contains(card);

  Future<void> restore() async {
    if (_restored) return;
    _restored = true;
    try {
      _hidden = await _store.readHiddenCards();
    } catch (_) {
      _hidden = {};
    }
    notifyListeners();
  }

  Future<void> setVisible(DashboardCard card, bool visible) async {
    final next = {..._hidden};
    if (visible) {
      next.remove(card);
    } else {
      next.add(card);
    }
    _hidden = next;
    notifyListeners();
    await _store.writeHiddenCards(next);
  }
}

class DashboardLayoutControllerScope extends InheritedWidget {
  const DashboardLayoutControllerScope({
    required this.controller,
    required super.child,
    super.key,
  });

  final DashboardLayoutController controller;

  static DashboardLayoutController? maybeOf(BuildContext context) {
    return context
        .dependOnInheritedWidgetOfExactType<DashboardLayoutControllerScope>()
        ?.controller;
  }

  @override
  bool updateShouldNotify(DashboardLayoutControllerScope oldWidget) =>
      controller != oldWidget.controller;
}
