package com.demoapp;

import com.sun.net.httpserver.HttpServer;
import java.io.OutputStream;
import java.net.InetSocketAddress;

/**
 * App de demo para el modo "Escuchando" de CodeMapper.
 *
 * Es una mini web Java (sin frameworks ni dependencias) con dos endpoints que
 * arman una cadena de llamadas entre clases:
 *
 *   GET /login     -> LoginController -> AuthService -> UserRepository -> TokenService   (OK)
 *   GET /checkout  -> OrderController -> OrderService -> PaymentGateway (LANZA excepcion) (ERROR)
 *
 * Se corre con el agente de OpenTelemetry apuntando a CodeMapper (ver
 * correr-demo.ps1). Cada vez que le pegas a un endpoint, el agente manda las
 * trazas a CodeMapper y el modo Escuchando dibuja el recorrido en vivo.
 */
public class DemoApp {
    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8085;
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);

        LoginController login = new LoginController();
        OrderController order = new OrderController();

        server.createContext("/login", exchange -> {
            String body;
            int code = 200;
            try {
                body = login.login("ariel@reserva.com", "1234");
            } catch (Exception e) {
                code = 500;
                body = "error: " + e.getMessage();
            }
            respond(exchange, code, body);
        });

        server.createContext("/checkout", exchange -> {
            String body;
            int code = 200;
            try {
                body = order.checkout("order-42");
            } catch (Exception e) {
                code = 500;
                body = "error: " + e.getMessage();
            }
            respond(exchange, code, body);
        });

        server.createContext("/", exchange ->
            respond(exchange, 200,
                "Demo CodeMapper. Probá:\n" +
                "  http://localhost:" + port + "/login     (OK)\n" +
                "  http://localhost:" + port + "/checkout  (lanza excepcion)\n"));

        server.setExecutor(null);
        server.start();
        System.out.println("Demo app escuchando en http://localhost:" + port);
        System.out.println("Endpoints: /login (OK)  y  /checkout (ERROR)");
    }

    private static void respond(com.sun.net.httpserver.HttpExchange ex, int code, String body)
            throws java.io.IOException {
        byte[] bytes = body.getBytes();
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }
}

/* ---- /login (camino feliz) ---- */

class LoginController {
    private final AuthService authService = new AuthService();

    String login(String email, String pass) throws InterruptedException {
        Thread.sleep(15);
        return authService.authenticate(email, pass);
    }
}

class AuthService {
    private final UserRepository userRepository = new UserRepository();
    private final TokenService tokenService = new TokenService();

    String authenticate(String email, String pass) throws InterruptedException {
        Thread.sleep(10);
        String user = userRepository.findByEmail(email);
        return tokenService.issueToken(user);
    }
}

class UserRepository {
    String findByEmail(String email) throws InterruptedException {
        Thread.sleep(20);
        return "user:" + email;
    }
}

class TokenService {
    String issueToken(String user) throws InterruptedException {
        Thread.sleep(8);
        return "OK token para " + user;
    }
}

/* ---- /checkout (camino con error) ---- */

class OrderController {
    private final OrderService orderService = new OrderService();

    String checkout(String orderId) throws InterruptedException {
        Thread.sleep(12);
        return orderService.place(orderId);
    }
}

class OrderService {
    private final PaymentGateway paymentGateway = new PaymentGateway();

    String place(String orderId) throws InterruptedException {
        Thread.sleep(10);
        return paymentGateway.charge(orderId);
    }
}

class PaymentGateway {
    String charge(String orderId) throws InterruptedException {
        Thread.sleep(14);
        // Acá se rompe el recorrido — el modo Escuchando lo pinta de rojo.
        throw new IllegalStateException("Tarjeta rechazada para " + orderId);
    }
}
