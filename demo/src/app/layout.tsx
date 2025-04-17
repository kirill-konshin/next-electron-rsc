export default function RootLayout(props) {
    return (
        <html lang="en">
            <head>
                <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
                <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
            </head>
            <body>{props.children}</body>
        </html>
    );
}
