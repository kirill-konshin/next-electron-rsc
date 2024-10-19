import Head from 'next/head';

export default function MyApp(props) {
    const { Component, pageProps } = props;
    return (
        <>
            <Head>
                <meta name="viewport" content="initial-scale=1, width=device-width" />
            </Head>
            <Component {...pageProps} />
        </>
    );
}
