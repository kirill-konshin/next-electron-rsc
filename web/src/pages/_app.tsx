import Head from 'next/head';
import { CssBaseline, ThemeProvider } from '@mui/material';
import theme from '../components/theme';

export default function MyApp(props) {
    const { Component, pageProps } = props;
    return (
        <>
            <Head>
                <meta name="viewport" content="initial-scale=1, width=device-width" />
            </Head>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <Component {...pageProps} />
            </ThemeProvider>
        </>
    );
}
