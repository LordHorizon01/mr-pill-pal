import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

const subscribe = (onStoreChange: () => void) => {
  const subscription = Appearance.addChangeListener(onStoreChange);
  return () => subscription.remove();
};

const getSnapshot = () => Appearance.getColorScheme();
const getServerSnapshot = () => 'light';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
