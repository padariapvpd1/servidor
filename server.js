const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 10000;

// ========================================
// FILA DE COMANDOS
// ========================================

const comandosPendentes = new Map();

// ========================================
// RESPOSTAS DOS DISPOSITIVOS
// ========================================

const respostasDispositivos = new Map();

// ========================================
// ÚLTIMO CONTATO DOS DISPOSITIVOS
// ========================================

const dispositivos = new Map();


// ========================================
// BUSCAR ENDEREÇO
// ========================================

async function buscarEndereco(latitude, longitude) {

    const url =
        `https://nominatim.openstreetmap.org/reverse` +
        `?format=jsonv2` +
        `&lat=${encodeURIComponent(latitude)}` +
        `&lon=${encodeURIComponent(longitude)}` +
        `&zoom=18` +
        `&addressdetails=1`;

    const resposta = await fetch(url, {
        headers: {
            "User-Agent": "ServidorAndroid/1.0"
        }
    });

    if (!resposta.ok) {

        throw new Error(
            `Nominatim respondeu HTTP ${resposta.status}`
        );
    }

    return await resposta.json();
}


// ========================================
// RECEBER DISPOSITIVO
// ========================================

app.post("/api/device", async (req, res) => {

    try {

        const dados = req.body || {};

        let ip =
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            "Desconhecido";

        if (ip.includes(",")) {

            ip = ip
                .split(",")[0]
                .trim();
        }

        ip = ip.replace(
            "::ffff:",
            ""
        );

        const deviceId =
            dados.deviceId ||
            "desconhecido";

        // Registrar dispositivo

        dispositivos.set(
            deviceId,
            {
                deviceId,
                marca: dados.marca || "",
                fabricante: dados.fabricante || "",
                modelo: dados.modelo || "",
                android: dados.android || "",
                ip,
                latitude: dados.latitude,
                longitude: dados.longitude,
                bairro: dados.bairro || "",
                cidade: dados.cidade || "",
                estado: dados.estado || "",
                cep: dados.cep || "",
                pais: dados.pais || "",
                ultimoContato:
                    new Date().toISOString()
            }
        );

        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "       NOVO DISPOSITIVO CONECTADO"
        );

        console.log(
            "========================================"
        );

        console.log(
            "ID:          ",
            deviceId
        );

        console.log(
            "Marca:       ",
            dados.marca || "Não informado"
        );

        console.log(
            "Fabricante:  ",
            dados.fabricante || "Não informado"
        );

        console.log(
            "Modelo:      ",
            dados.modelo || "Não informado"
        );

        console.log(
            "Android:     ",
            dados.android || "Não informado"
        );

        console.log(
            "IP:          ",
            ip
        );


        const latitude =
            dados.latitude;

        const longitude =
            dados.longitude;


        if (
            typeof latitude === "number" &&
            typeof longitude === "number"
        ) {

            console.log("");

            console.log(
                "COORDENADAS:"
            );

            console.log(
                "Latitude:    ",
                latitude
            );

            console.log(
                "Longitude:   ",
                longitude
            );


            try {

                const endereco =
                    await buscarEndereco(
                        latitude,
                        longitude
                    );

                const address =
                    endereco.address || {};


                const bairro =
                    address.suburb ||
                    address.neighbourhood ||
                    address.village ||
                    "Não informado";


                const cidade =
                    address.city ||
                    address.town ||
                    address.municipality ||
                    address.village ||
                    "Não informada";


                const estado =
                    address.state ||
                    "Não informado";


                const cep =
                    address.postcode ||
                    "Não informado";


                const pais =
                    address.country ||
                    "Não informado";


                console.log("");

                console.log(
                    "LOCALIZAÇÃO APROXIMADA:"
                );

                console.log(
                    "Bairro:      ",
                    bairro
                );

                console.log(
                    "Cidade:      ",
                    cidade
                );

                console.log(
                    "Estado:      ",
                    estado
                );

                console.log(
                    "CEP:         ",
                    cep
                );

                console.log(
                    "País:        ",
                    pais
                );


                console.log("");

                console.log(
                    "Endereço retornado pelo serviço:"
                );

                console.log(
                    endereco.display_name ||
                    "Não informado"
                );

            } catch (erroEndereco) {

                console.error(
                    "Erro ao consultar localização:",
                    erroEndereco.message
                );
            }

        } else {

            console.log("");

            console.log(
                "Localização não enviada pelo aplicativo."
            );
        }


        console.log("");

        console.log(
            "========================================"
        );

        console.log("");


        res.status(200).json({

            sucesso: true

        });

    } catch (erro) {

        console.error(
            "Erro ao processar dispositivo:",
            erro
        );

        res.status(500).json({

            sucesso: false

        });
    }
});


// ========================================
// ENVIAR COMANDO
// ========================================

app.post("/api/command", (req, res) => {

    const {
        deviceId,
        command
    } = req.body || {};


    if (!deviceId || !command) {

        return res.status(400).json({

            sucesso: false,

            erro:
                "deviceId e command são obrigatórios"

        });
    }


    // Comandos permitidos

    const comandosPermitidos = [
        "PING",
        "STATUS"
    ];


    if (
        !comandosPermitidos.includes(command)
    ) {

        return res.status(400).json({

            sucesso: false,

            erro:
                "Comando não permitido"

        });
    }


    if (
        !comandosPendentes.has(deviceId)
    ) {

        comandosPendentes.set(
            deviceId,
            []
        );
    }


    comandosPendentes
        .get(deviceId)
        .push({

            command,

            criadoEm:
                new Date().toISOString()

        });


    console.log("");

    console.log(
        "========================================"
    );

    console.log(
        "          NOVO COMANDO"
    );

    console.log(
        "========================================"
    );

    console.log(
        "Dispositivo:",
        deviceId
    );

    console.log(
        "Comando:    ",
        command
    );

    console.log(
        "========================================"
    );


    res.status(200).json({

        sucesso: true,

        mensagem:
            "Comando colocado na fila"

    });
});


// ========================================
// ANDROID BUSCA COMANDO
// ========================================

app.get(
    "/api/command/:deviceId",
    (req, res) => {

        const {
            deviceId
        } = req.params;


        const fila =
            comandosPendentes.get(
                deviceId
            ) || [];


        if (fila.length === 0) {

            return res.status(200).json({

                sucesso: true,

                comando: null

            });
        }


        const comando =
            fila.shift();


        res.status(200).json({

            sucesso: true,

            comando

        });
    }
);


// ========================================
// RECEBER RESPOSTA
// ========================================

app.post(
    "/api/response",
    (req, res) => {

        const {
            deviceId,
            response
        } = req.body || {};


        if (
            !deviceId ||
            !response
        ) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "deviceId e response são obrigatórios"

            });
        }


        respostasDispositivos.set(
            deviceId,
            {
                response,

                recebidoEm:
                    new Date().toISOString()
            }
        );


        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "       RESPOSTA DO DISPOSITIVO"
        );

        console.log(
            "========================================"
        );

        console.log(
            "Dispositivo:",
            deviceId
        );

        console.log(
            "Resposta:   ",
            response
        );

        console.log(
            "========================================"
        );


        res.status(200).json({

            sucesso: true

        });
    }
);


// ========================================
// LISTAR DISPOSITIVOS
// ========================================

app.get(
    "/api/devices",
    (req, res) => {

        res.json({

            sucesso: true,

            dispositivos:
                Array.from(
                    dispositivos.values()
                )
        });
    }
);


// ========================================
// ÚLTIMA RESPOSTA
// ========================================

app.get(
    "/api/response/:deviceId",
    (req, res) => {

        const resposta =
            respostasDispositivos.get(
                req.params.deviceId
            );


        if (!resposta) {

            return res.json({

                sucesso: true,

                resposta: null

            });
        }


        res.json({

            sucesso: true,

            resposta

        });
    }
);


// ========================================
// PAINEL WEB
// ========================================

app.get("/", (req, res) => {

    res.send(`

<!DOCTYPE html>

<html lang="pt-BR">

<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width,
               initial-scale=1.0">

<title>Controle do Dispositivo</title>

<style>

body {

    margin: 0;

    background: #111;

    color: white;

    font-family: Arial, sans-serif;

}

.container {

    max-width: 700px;

    margin: 50px auto;

    padding: 25px;

}

h1 {

    text-align: center;

}

.card {

    background: #1d1d1d;

    padding: 25px;

    border-radius: 12px;

    margin-top: 20px;

}

.status {

    margin: 15px 0;

    padding: 12px;

    background: #292929;

    border-radius: 8px;

}

button {

    padding: 14px 25px;

    margin: 5px;

    border: none;

    border-radius: 8px;

    cursor: pointer;

    font-size: 16px;

}

button:hover {

    opacity: 0.8;

}

pre {

    background: #000;

    padding: 15px;

    border-radius: 8px;

    overflow-x: auto;

}

</style>

</head>


<body>

<div class="container">

<h1>
Controle do Dispositivo
</h1>


<div class="card">

<h2>
celular-001
</h2>


<div class="status">

Status:

<strong id="status">
Verificando...
</strong>

</div>


<button onclick="enviar('PING')">
PING
</button>


<button onclick="enviar('STATUS')">
STATUS
</button>


<h3>
Última resposta
</h3>


<pre id="resposta">
Nenhuma resposta ainda.
</pre>

</div>

</div>


<script>

const deviceId =
    "celular-001";


async function enviar(command) {

    const resposta =
        await fetch(
            "/api/command",
            {

                method: "POST",

                headers: {

                    "Content-Type":
                        "application/json"

                },

                body: JSON.stringify({

                    deviceId,

                    command

                })

            }
        );


    const dados =
        await resposta.json();


    if (!dados.sucesso) {

        alert(
            dados.erro ||
            "Erro"
        );

        return;
    }


    document.getElementById(
        "resposta"
    ).textContent =
        "Comando enviado: " +
        command;


    setTimeout(
        verificarResposta,
        3000
    );
}


async function verificarResposta() {

    try {

        const resposta =
            await fetch(
                "/api/response/" +
                deviceId
            );


        const dados =
            await resposta.json();


        if (
            dados.sucesso &&
            dados.resposta
        ) {

            document.getElementById(
                "resposta"
            ).textContent =
                dados.resposta.response;

        }

    } catch (erro) {

        console.error(erro);
    }
}


async function verificarStatus() {

    try {

        const resposta =
            await fetch(
                "/api/devices"
            );


        const dados =
            await resposta.json();


        const dispositivo =
            dados.dispositivos.find(
                d =>
                    d.deviceId ===
                    deviceId
            );


        if (!dispositivo) {

            document.getElementById(
                "status"
            ).textContent =
                "OFFLINE";

            return;
        }


        const ultimoContato =
            new Date(
                dispositivo.ultimoContato
            );


        const agora =
            new Date();


        const segundos =
            (
                agora -
                ultimoContato
            ) / 1000;


        if (segundos < 30) {

            document.getElementById(
                "status"
            ).textContent =
                "ONLINE";

        } else {

            document.getElementById(
                "status"
            ).textContent =
                "OFFLINE";
        }

    } catch (erro) {

        document.getElementById(
            "status"
        ).textContent =
            "ERRO";
    }
}


setInterval(
    verificarStatus,
    5000
);


setInterval(
    verificarResposta,
    3000
);


verificarStatus();

verificarResposta();

</script>

</body>

</html>

    `);
});


// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "       SERVIDOR INICIADO"
        );

        console.log(
            "========================================"
        );

        console.log(
            "Porta:",
            PORT
        );

        console.log(
            "Painel: /"
        );

        console.log(
            "Aguardando dispositivos..."
        );

        console.log("");
    }
);