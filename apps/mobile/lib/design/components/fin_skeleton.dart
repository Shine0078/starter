/// Skeleton placeholders (MISSION2 §33: "Do not show blank screens").
///
/// A spinner says "something is happening". A skeleton says "something is
/// happening, here is the shape of what is coming, and the app has not
/// crashed". On a financial dashboard the second is worth a great deal more,
/// because a blank screen where your money should be is alarming.
///
/// The shimmer honours `prefers-reduced-motion` via [MediaQuery.disableAnimations]
/// — a looping animation is exactly what that setting exists to stop.
library;

import 'package:flutter/material.dart';

import '../colors.dart';
import '../tokens.dart';

/// A single shimmering block. Compose these into the shape of the real content.
class FinSkeleton extends StatefulWidget {
  const FinSkeleton({
    this.width,
    this.height = 14,
    this.borderRadius = const BorderRadius.all(FinRadius.sm),
    super.key,
  });

  /// Null fills the available width.
  final double? width;
  final double height;
  final BorderRadius borderRadius;

  @override
  State<FinSkeleton> createState() => _FinSkeletonState();
}

class _FinSkeletonState extends State<FinSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: FinDuration.shimmer,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Started here rather than in initState so the controller actually stops
    // when reduced motion is on. Skipping only the shader would leave a
    // repeating animation running — burning battery for a user who explicitly
    // asked for less movement, and never letting the frame scheduler settle.
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _controller.stop();
    } else if (!_controller.isAnimating) {
      _controller.repeat();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fin = context.finColors;
    final still = MediaQuery.maybeDisableAnimationsOf(context) ?? false;

    if (still) {
      return _block(fin.skeleton);
    }

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final t = _controller.value;
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (bounds) => LinearGradient(
            begin: Alignment(-1 - 2 * t, 0),
            end: Alignment(1 - 2 * t, 0),
            colors: [fin.skeleton, fin.skeletonHighlight, fin.skeleton],
            stops: const [0.35, 0.5, 0.65],
          ).createShader(bounds),
          child: _block(fin.skeleton),
        );
      },
    );
  }

  Widget _block(Color color) => Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(color: color, borderRadius: widget.borderRadius),
      );
}

/// The dashboard's loading shape: a headline figure, then metric tiles, then
/// a few rows. Deliberately mirrors the real layout so nothing jumps when the
/// data lands.
class FinDashboardSkeleton extends StatelessWidget {
  const FinDashboardSkeleton({super.key});

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Loading your financial overview',
        liveRegion: true,
        child: ListView(
          padding: const EdgeInsets.all(FinSpace.lg),
          children: const [
            FinSkeleton(width: 140, height: 12),
            SizedBox(height: FinSpace.md),
            FinSkeleton(width: 220, height: 34),
            SizedBox(height: FinSpace.xxl),
            Row(children: [
              Expanded(child: FinSkeleton(height: 84, borderRadius: FinRadius.cardBorder)),
              SizedBox(width: FinSpace.md),
              Expanded(child: FinSkeleton(height: 84, borderRadius: FinRadius.cardBorder)),
            ]),
            SizedBox(height: FinSpace.xl),
            FinSkeleton(height: 160, borderRadius: FinRadius.cardBorder),
            SizedBox(height: FinSpace.xl),
            FinListSkeleton(rows: 4),
          ],
        ),
      );
}

/// Placeholder rows for a transaction feed.
class FinListSkeleton extends StatelessWidget {
  const FinListSkeleton({this.rows = 5, super.key});

  final int rows;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          for (var i = 0; i < rows; i++)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: FinSpace.md),
              child: Row(
                children: [
                  FinSkeleton(width: 40, height: 40, borderRadius: FinRadius.pillBorder),
                  SizedBox(width: FinSpace.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        FinSkeleton(width: 160, height: 13),
                        SizedBox(height: FinSpace.sm),
                        FinSkeleton(width: 90, height: 11),
                      ],
                    ),
                  ),
                  SizedBox(width: FinSpace.md),
                  FinSkeleton(width: 64, height: 15),
                ],
              ),
            ),
        ],
      );
}
