import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import SiteSelection from '../screens/SiteSelection';
import PatrolStart from '../screens/PatrolStart';
import QRScanner from '../screens/QRScanner';
import PatrolForm from '../screens/PatrolForm';
import VisitForm from '../screens/VisitForm';
import IncidentReport from '../screens/IncidentReport';
import SignInScreen from '../screens/auth/SignInScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import CreatePointScreen from '../screens/CreatePointScreen';
import IssueReview from '../screens/IssueReview';
import PatrolQRScreen from '../screens/PatrolQRScreen';
import EnrollmentScreen from '../screens/EnrollmentScreen';
import MarkAttendanceScreen from '../screens/MarkAttendanceScreen';
import SplashScreen from '../screens/SplashScreen';
import HistoryScreen from '../screens/tabs/HistoryScreen';
import VisitOfficerDetailScreen from '../screens/VisitOfficerDetailScreen';
import SiteAttendanceDashboardScreen from '../screens/SiteAttendanceDashboardScreen';
import AttendanceRecordsScreen from '../screens/AttendanceRecordsScreen';
import PatrolSiteDetailScreen from '../screens/PatrolSiteDetailScreen';
import PatrolOfficerSelectScreen from '../screens/PatrolOfficerSelectScreen';
import PatrolAddPointNameScreen from '../screens/PatrolAddPointNameScreen';
import PatrolSessionDetailScreen from '../screens/PatrolSessionDetailScreen';
import VisitorManagementScreen from '../screens/VisitorManagementScreen';
import AttendanceManualScreen from '../screens/AttendanceManualScreen';
import AttendanceApprovalsScreen from '../screens/AttendanceApprovalsScreen';

const Stack = createNativeStackNavigator();

import { useCustomAuth } from '../context/AuthContext';

export default function RootNavigator() {
    const { isCustomSignedIn, isLoading: isCustomLoading } = useCustomAuth();
    const [splashDone, setSplashDone] = React.useState(false);

    if (!splashDone) {
        return <SplashScreen onFinish={() => setSplashDone(true)} />;
    }

    if (isCustomLoading) return null;

    const authenticated = isCustomSignedIn;

    return (
        <Stack.Navigator
            screenOptions={{
                headerShown: false,
                animation: 'slide_from_right',
            }}
        >
            {authenticated ? (
                <>
                    <Stack.Screen name="MainTabs" component={TabNavigator} />
                    <Stack.Screen name="SiteSelection" component={SiteSelection} />
                    <Stack.Screen name="PatrolStart" component={PatrolStart} />
                    <Stack.Screen name="QRScanner" component={QRScanner} />
                    <Stack.Screen name="PatrolForm" component={PatrolForm} />
                    <Stack.Screen name="VisitForm" component={VisitForm} />
                    <Stack.Screen name="IncidentReport" component={IncidentReport} />
                    <Stack.Screen name="CreatePoint" component={CreatePointScreen} />
                    <Stack.Screen name="PatrolQR" component={PatrolQRScreen} />
                    <Stack.Screen name="IssueReview" component={IssueReview} />
                    <Stack.Screen name="Enrollment" component={EnrollmentScreen} />
                    <Stack.Screen name="MarkAttendance" component={MarkAttendanceScreen} />
                    <Stack.Screen name="SiteAttendanceDashboard" component={SiteAttendanceDashboardScreen} />
                    <Stack.Screen name="AttendanceRecords" component={AttendanceRecordsScreen} />
                    <Stack.Screen name="PatrolSiteDetail" component={PatrolSiteDetailScreen} />
                    <Stack.Screen name="PatrolAddPointName" component={PatrolAddPointNameScreen} />
                    <Stack.Screen name="PatrolSessionDetail" component={PatrolSessionDetailScreen} />
                    <Stack.Screen name="PatrolOfficerSelect" component={PatrolOfficerSelectScreen} />
                    <Stack.Screen name="PatrolHistory" component={HistoryScreen} />
                    <Stack.Screen name="VisitOfficerDetail" component={VisitOfficerDetailScreen} />
                    <Stack.Screen name="VisitorManagement" component={VisitorManagementScreen} />
                    <Stack.Screen name="AttendanceManual" component={AttendanceManualScreen} />
                    <Stack.Screen name="AttendanceApprovals" component={AttendanceApprovalsScreen} />
                </>
            ) : (
                <>
                    <Stack.Screen name="SignIn" component={SignInScreen} />
                </>
            )}
        </Stack.Navigator>
    );
}
