import Toast, { BaseToast, ErrorToast, InfoToast } from 'react-native-toast-message';
import React from 'react';
import { View, Text } from 'react-native';

export const toastConfig = {
  success: (props: any) => (
    <BaseToast
      {...props}
      style={{ borderLeftColor: '#10b981', backgroundColor: '#0f172a', height: 70, borderRadius: 16 }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white'
      }}
      text2Style={{
        fontSize: 13,
        color: '#94a3b8'
      }}
    />
  ),
  error: (props: any) => (
    <ErrorToast
      {...props}
      style={{ borderLeftColor: '#ef4444', backgroundColor: '#0f172a', height: 70, borderRadius: 16 }}
      text1Style={{
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white'
      }}
      text2Style={{
        fontSize: 13,
        color: '#f87171'
      }}
    />
  ),
  info: (props: any) => (
    <InfoToast
      {...props}
      style={{ borderLeftColor: '#3b82f6', backgroundColor: '#0f172a', height: 70, borderRadius: 16 }}
      text1Style={{
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white'
      }}
      text2Style={{
        fontSize: 13,
        color: '#94a3b8'
      }}
    />
  )
};

export const showSuccess = (title: string, message?: string) => {
  Toast.show({
    type: 'success',
    text1: title,
    text2: message,
    position: 'top',
    visibilityTime: 4000,
  });
};

export const showError = (title: string, message?: string) => {
  Toast.show({
    type: 'error',
    text1: title,
    text2: message,
    position: 'top',
    visibilityTime: 5000,
  });
};

export const showInfo = (title: string, message?: string) => {
  Toast.show({
    type: 'info',
    text1: title,
    text2: message,
    position: 'top',
  });
};
