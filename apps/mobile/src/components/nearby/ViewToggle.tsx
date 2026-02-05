import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type ViewMode = 'list' | 'map';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        testID="view-toggle-list"
        style={[styles.option, value === 'list' && styles.optionActive]}
        onPress={() => onChange('list')}
      >
        <Text style={[styles.optionText, value === 'list' && styles.optionTextActive]}>
          Lista
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="view-toggle-map"
        style={[styles.option, value === 'map' && styles.optionActive]}
        onPress={() => onChange('map')}
      >
        <Text style={[styles.optionText, value === 'map' && styles.optionTextActive]}>
          Mapa
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#E5E5EA',
    borderRadius: 8,
    padding: 2,
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  optionActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  optionTextActive: {
    color: '#007AFF',
  },
});
