import { PayloadAction, createSlice } from '@reduxjs/toolkit';

export type AppMode = 'administrator' | 'cashier' | 'delivery_driver' | 'customer' | null;

type AppState = {
  mode: AppMode;
  adminAuthenticated: boolean;
  adminAuthChecked: boolean;
};

const initialState: AppState = {
  mode: null,
  adminAuthenticated: false,
  adminAuthChecked: false,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setMode: (state, action: PayloadAction<AppMode>) => {
      state.mode = action.payload;
      if (action.payload !== 'administrator') {
        state.adminAuthenticated = false;
        state.adminAuthChecked = false;
      }
    },
    clearMode: (state) => {
      state.mode = null;
      state.adminAuthenticated = false;
      state.adminAuthChecked = false;
    },
    setAdminSessionState: (
      state,
      action: PayloadAction<{ authenticated: boolean; checked: boolean }>,
    ) => {
      state.adminAuthenticated = action.payload.authenticated;
      state.adminAuthChecked = action.payload.checked;
    },
  },
});

export const { clearMode, setAdminSessionState, setMode } = appSlice.actions;
export default appSlice.reducer;
