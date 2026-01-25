import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📧</Text>
      <Text style={styles.title}>Sprawdź email</Text>
      <Text style={styles.message}>
        Wysłaliśmy link do logowania na adres:
      </Text>
      <Text style={styles.email}>{email}</Text>
      <Text style={styles.hint}>
        Kliknij link w emailu, aby się zalogować.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  icon: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  email: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 8,
    marginBottom: 24,
  },
  hint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});
