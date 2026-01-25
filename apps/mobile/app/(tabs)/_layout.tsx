import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { View, ActivityIndicator, Text } from 'react-native';

export default function TabsLayout() {
  const session = useAuthStore((state) => state.session);
  const isLoading = useAuthStore((state) => state.isLoading);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // If not logged in, redirect to auth
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'W okolicy',
          tabBarIcon: ({ color }) => <TabIcon name="📍" color={color} />,
        }}
      />
      <Tabs.Screen
        name="waves"
        options={{
          title: 'Zaczepienia',
          tabBarIcon: ({ color }) => <TabIcon name="👋" color={color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Czaty',
          tabBarIcon: ({ color }) => <TabIcon name="💬" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <TabIcon name="👤" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ name, color }: { name: string; color: string }) {
  return (
    <Text style={{ fontSize: 20, opacity: color === '#007AFF' ? 1 : 0.5 }}>
      {name}
    </Text>
  );
}
