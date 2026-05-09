import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '@/lib/api';

export interface User {
    id: string;
    name: string;
    email: string;
    role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
    avatar?: string;
    bio?: string;
}

interface AuthState {
    user: User | null;
    loading: boolean;
    initialized: boolean;
}

const initialState: AuthState = {
    user: null,
    loading: false,
    initialized: false,
};

export const fetchMe = createAsyncThunk('auth/fetchMe', async (_, { rejectWithValue }) => {
    try {
        const res = await authApi.me();
        return (res.data.user ?? res.data) as User;
    } catch {
        return rejectWithValue(null);
    }
});

export const logoutUser = createAsyncThunk('auth/logout', async () => {
    try { await authApi.logout(); } catch {}
    if (typeof window !== 'undefined') window.location.href = '/login';
});

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        setUser(state, action: PayloadAction<User | null>) {
            state.user = action.payload;
        },
        clearUser(state) {
            state.user = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchMe.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchMe.fulfilled, (state, action) => {
                state.user = action.payload;
                state.loading = false;
                state.initialized = true;
            })
            .addCase(fetchMe.rejected, (state) => {
                state.user = null;
                state.loading = false;
                state.initialized = true;
            })
            .addCase(logoutUser.fulfilled, (state) => {
                state.user = null;
            });
    },
});

export const { setUser, clearUser } = authSlice.actions;
export default authSlice.reducer;
