'use client';

import { CssBaseline, ThemeProvider } from '@mui/material';

import { createTheme } from '@mui/material';

export const theme = createTheme({});

export function Theme({ children }) {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
        </ThemeProvider>
    );
}
