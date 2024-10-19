import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';
import { Theme } from '../components/theme';

export default function RootLayout(props) {
    return (
        <html lang="en">
            <body>
                <AppRouterCacheProvider>
                    <Theme>{props.children}</Theme>
                </AppRouterCacheProvider>
            </body>
        </html>
    );
}
