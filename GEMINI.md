# Hometab Project Overview

"Hometab" is a client-side web application designed as a personal dashboard or 'hometab' page. It's built with Alpine.js for dynamic UI and Tailwind CSS for styling, all served by a lightweight Node.js Express backend. The application features widgets for managing useful links, personal notes, and a todo list. Data for these widgets is persisted locally using the browser's LocalStorage.

## Technologies Used:

*   **Frontend:** HTML, JavaScript (Alpine.js), Tailwind CSS
*   **Backend:** Node.js, Express
*   **Build Tools:** npm, concurrently, `@tailwindcss/cli`
*   **Data Persistence:** Browser's `localStorage`

## Building and Running:

The project uses `npm` scripts for development and serving the application.

### Prerequisites:

*   Node.js (LTS version recommended)
*   npm (Node Package Manager, usually bundled with Node.js)

### Installation:

Clone the repository and install the necessary dependencies:

```bash
git clone <repository-url>
cd hometab
npm install
```

### Running the Development Server:

This command starts the Node.js Express server on `http://localhost:9000` and concurrently watches for changes in your Tailwind CSS source file (`src/input.css`) to automatically recompile it to `public/css/style.css`.

```bash
npm start
```

The application will be accessible in your browser at `http://localhost:9000`. You can also access it from other devices on your local network using your machine's local IP address (e.g., `http://<YOUR_LOCAL_IP_ADDRESS>:9000`).

### Other Scripts:

*   **Serving only the application (without CSS watch):**
    ```bash
    npm run serve
    ```
*   **Watching CSS for changes only (for Tailwind CSS development):**
    ```bash
    npm run watch:css
    ```

## Development Conventions:

*   **Frontend Framework:** Alpine.js is used for managing component state, reactivity, and UI interactions directly within the HTML.
*   **Styling:** Tailwind CSS is utilized for a utility-first approach to styling. All custom CSS is processed via Tailwind.
*   **Backend:** A minimal Node.js Express server is used solely for serving static frontend assets from the `public/` directory. There are no API endpoints beyond serving files.
*   **Data Persistence:** All application data (links, notes, todos) is stored on the client-side in the browser's `localStorage`.
*   **Code Structure:** Frontend logic is modularized into separate Alpine.js data components (e.g., `hometabApp`, `linksApp`, `notesApp`, `todoApp`), defined within `public/js/main.js`.
*   **Error Handling:** Basic error handling is implemented in `server.js` to manage port conflicts upon startup.
*   **Internationalization:** The application's interface and messages are primarily in French.
