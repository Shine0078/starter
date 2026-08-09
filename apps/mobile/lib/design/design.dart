/// The FINVERSE design system.
///
/// One import for every screen: `import '../design/design.dart';`
///
/// The rule this exists to enforce — screens describe layout and content, the
/// design system decides how it looks. A screen that reaches for a raw colour
/// or a magic padding is a screen that will be wrong the next time either
/// changes, and inconsistency across twelve screens is most of what makes an
/// app feel unfinished (MISSION2 §2).
library;

export 'colors.dart';
export 'components/fin_metric_tile.dart';
export 'components/fin_skeleton.dart';
export 'components/fin_states.dart';
export 'components/money_text.dart';
export 'theme.dart';
export 'tokens.dart';
export 'typography.dart';
