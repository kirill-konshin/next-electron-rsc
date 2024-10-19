import Head from 'next/head';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { Theme } from '../components/theme';

export default function MyApp(props) {
    const { Component, pageProps } = props;
    return (
        <>
            <Head>
                <meta name="viewport" content="initial-scale=1, width=device-width" />
            </Head>
            <Theme>
                <CssBaseline />
                <Component {...pageProps} />
            </Theme>
        </>
    );
}
