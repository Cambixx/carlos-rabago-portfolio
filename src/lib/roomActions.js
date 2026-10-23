import { createContext, useContext } from 'react';

/**
 * Acciones de la sala que la app expone a los paneles (lo usa el terminal):
 * { navigate, toggleLamp, toggleMusic, setSky, getWorld, weather, hire }.
 */
export const RoomActionsContext = createContext(null);

export const useRoomActions = () => useContext(RoomActionsContext);
