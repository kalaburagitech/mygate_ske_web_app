import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

type BoxProps = {
    width?: number | string;
    height: number;
    radius?: number;
    style?: ViewStyle;
};

/** Lightweight skeleton pulse (no ActivityIndicator). */
export function SkeletonBox({ width = '100%', height, radius = 8, style }: BoxProps) {
    const opacity = useRef(new Animated.Value(0.35)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0.65, duration: 700, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [opacity]);
    return (
        <Animated.View
            style={[
                styles.box,
                {
                    width: width as any,
                    height,
                    borderRadius: radius,
                    opacity,
                },
                style,
            ]}
        />
    );
}

export function SkeletonAttendanceCard() {
    return (
        <View style={styles.card}>
            <SkeletonBox height={18} width="55%" radius={6} />
            <SkeletonBox height={14} width="35%" radius={6} style={{ marginTop: 10 }} />
            <View style={styles.row}>
                <SkeletonBox height={40} width="42%" radius={12} style={{ marginTop: 14 }} />
                <SkeletonBox height={40} width="42%" radius={12} style={{ marginTop: 14 }} />
            </View>
        </View>
    );
}

export function SkeletonSiteRow() {
    return (
        <View style={styles.siteRow}>
            <SkeletonBox height={48} width={48} radius={14} />
            <View style={{ flex: 1, gap: 8 }}>
                <SkeletonBox height={16} width="70%" radius={6} />
                <SkeletonBox height={12} width="45%" radius={6} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    box: { backgroundColor: 'rgba(148,163,184,0.25)' },
    card: {
        marginBottom: 12,
        padding: 16,
        borderRadius: 20,
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    siteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 18,
        borderRadius: 20,
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        marginBottom: 12,
    },
});
