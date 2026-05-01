import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Tiled "POCKET RESUME" watermark for any preview surface.
 *
 * Drop it as the last child of a relatively-positioned container that
 * shows resume content; it absolute-fills the parent and prints the
 * brand at a -30° angle in a 4×4 grid. pointer-events: 'box-none' lets
 * touches pass through to the underlying content.
 *
 * The watermark exists only on the in-app preview. The paid PDF that
 * the server generates after a download token is verified is always
 * clean — see the resume.controller PDF route.
 */
export function WatermarkOverlay({ clean = false }: { clean?: boolean }) {
  if (clean) return null;
  // Fixed grid of labels rather than a backgroundImage URL so this works
  // in React Native with no native dependency. Absolute positioning lets
  // each cell drift independently for a believable tile.
  const cells = Array.from({ length: 16 }, (_, i) => i);
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      {cells.map((i) => (
        <View
          key={i}
          style={[
            styles.cell,
            {
              top: `${(i % 4) * 25}%`,
              left: `${Math.floor(i / 4) * 25}%`,
            },
          ]}
        >
          <Text style={styles.text}>POCKET RESUME</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 50,
  },
  cell: {
    position: 'absolute',
    width: '25%',
    height: '25%',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-30deg' }],
  },
  text: {
    color: 'rgba(26, 58, 92, 0.13)',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
