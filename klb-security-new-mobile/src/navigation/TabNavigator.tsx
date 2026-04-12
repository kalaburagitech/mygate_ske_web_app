import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/tabs/HomeScreen';
import AttendanceHistoryScreen from '../screens/tabs/AttendanceHistoryScreen';
import OfficerDashboard from '../screens/OfficerDashboard';
import PatrolHubScreen from '../screens/PatrolHubScreen';
import IssueReview from '../screens/IssueReview';
import VisitingTeamScreen from '../screens/VisitingTeamScreen';
import { Home, QrCode, ShieldAlert, ClipboardList, Calendar } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCustomAuth } from '../context/AuthContext';
import { canAccessMonitoringDashboard, hasVisitingOfficerRole } from '../utils/roleUtils';

const Tab = createBottomTabNavigator();

function shouldShowVisitingTab(user: { roles?: string[] } | null): boolean {
    if (!canAccessMonitoringDashboard(user)) {
        return true;
    }
    return hasVisitingOfficerRole(user);
}

export default function TabNavigator() {
    const { customUser } = useCustomAuth();
    const showVisiting = shouldShowVisitingTab(customUser);
    const insets = useSafeAreaInsets();

    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: '#0f172a',
                    borderTopColor: 'rgba(255,255,255,0.05)',
                    height: 58 + insets.bottom,
                    paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
                    paddingTop: 8,
                },
                tabBarActiveTintColor: '#2563eb',
                tabBarInactiveTintColor: '#64748b',
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: 'bold',
                },
            }}
        >
            <Tab.Screen
                name="Home"
                component={canAccessMonitoringDashboard(customUser) ? OfficerDashboard : HomeScreen}
                options={{
                    tabBarIcon: ({ color }) => <Home color={color} size={22} />,
                    tabBarLabel: 'Home',
                }}
            />
            <Tab.Screen
                name="Attendance"
                component={AttendanceHistoryScreen}
                options={{
                    tabBarIcon: ({ color }) => <Calendar color={color} size={22} />,
                    tabBarLabel: 'Attendance',
                }}
            />
            <Tab.Screen
                name="Patrol"
                component={PatrolHubScreen}
                options={{
                    tabBarIcon: ({ color }) => <QrCode color={color} size={22} />,
                    tabBarLabel: 'Patrol',
                }}
            />
            <Tab.Screen
                name="Issues"
                component={IssueReview}
                options={{
                    tabBarIcon: ({ color }) => <ShieldAlert color={color} size={22} />,
                    tabBarLabel: 'Issues',
                }}
            />
            {showVisiting ? (
                <Tab.Screen
                    name="Visiting"
                    component={VisitingTeamScreen}
                    options={{
                        tabBarIcon: ({ color }) => <ClipboardList color={color} size={22} />,
                        tabBarLabel: 'Visiting',
                    }}
                />
            ) : null}
        </Tab.Navigator>
    );
}
