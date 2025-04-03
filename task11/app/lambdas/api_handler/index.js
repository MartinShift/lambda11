const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, InitiateAuthCommand } = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');

const cognito = new CognitoIdentityProviderClient();
const dynamoClient = new DynamoDBClient();
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);

const USER_POOL_ID = process.env.cup_id;
const CLIENT_ID = process.env.cup_client_id;
const TABLES_TABLE = process.env.TABLES_TABLE;
const RESERVATIONS_TABLE = process.env.RESERVATIONS_TABLE;

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event));
    console.log('Environment variables:', process.env);

    try {
        const route = `${event.resource} ${event.httpMethod}`;
        console.log('Route:', route);

        let result;
        switch (route) {
            case '/signup POST':
                result = await signup(JSON.parse(event.body));
                break;
            case '/signin POST':
                result = await signin(JSON.parse(event.body));
                break;
            case '/tables GET':
                result = await getTables(event.headers);
                break;
            case '/tables POST':
                result = await createTable(JSON.parse(event.body), event.headers);
                break;
            case '/tables/{tableId} GET':
                result = await getTable(event.pathParameters.tableId, event.headers);
                break;
            case '/reservations POST':
                result = await createReservation(JSON.parse(event.body), event.headers);
                break;
            case '/reservations GET':
                result = await getReservations(event.headers);
                break;
            default:
                result = { statusCode: 404, body: JSON.stringify({ message: 'Not Found' }) };
        }

        return {
            statusCode: result.statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
                ...result.headers
            },
            body: result.body,
            isBase64Encoded: false
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
            isBase64Encoded: false
        };
    }
};

async function signup(body) {
    const { firstName, lastName, email, password } = body;

    if (!isValidEmail(email) || !isValidPassword(password)) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid email or password format' }) };
    }

    const params = {
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'given_name', Value: firstName },
            { Name: 'family_name', Value: lastName }
        ],
        MessageAction: 'SUPPRESS'
    };

    try {
        await cognito.send(new AdminCreateUserCommand(params));
        await cognito.adminSetUserPassword({
            UserPoolId: USER_POOL_ID,
            Username: email,
            Password: password,
            Permanent: true
        }).promise();
        return { statusCode: 200, body: JSON.stringify({ message: 'User created successfully' }) };
    } catch (error) {
        console.error('Error in signup:', error);
        return { statusCode: 400, body: JSON.stringify({ message: 'Error in signup', error: error.message }) };
    }
}

async function signin(body) {
    const { email, password } = body;

    const params = {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password
        }
    };

    try {
        const result = await cognito.initiateAuth(params).promise();
        return { statusCode: 200, body: JSON.stringify({ idToken: result.AuthenticationResult.IdToken }) };
    } catch (error) {
        console.error('Error in signin:', error);
        return { statusCode: 400, body: JSON.stringify({ message: 'Error in signin', error: error.message }) };
    }
}

async function getTables(headers) {
    if (!verifyToken(headers)) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    try {
        const result = await dynamodb.send(new ScanCommand({ TableName: TABLES_TABLE }));
        return { statusCode: 200, body: JSON.stringify({ tables: result.Items }) };
    } catch (error) {
        console.error('Error getting tables:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error getting tables', error: error.message }) };
    }
}

async function createTable(body, headers) {
    if (!verifyToken(headers)) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const tableItem = {
        id: uuid.v4(),
        number: body.number,
        places: body.places,
        isVip: body.isVip,
        minOrder: body.minOrder || 0
    };

    try {
        await dynamodb.put({ TableName: TABLES_TABLE, Item: tableItem }).promise();
        return { statusCode: 200, body: JSON.stringify({ id: tableItem.id }) };
    } catch (error) {
        console.error('Error creating table:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error creating table', error: error.message }) };
    }
}

async function getTable(tableId, headers) {
    if (!verifyToken(headers)) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    try {
        const result = await dynamodb.get({ TableName: TABLES_TABLE, Key: { id: tableId } }).promise();
        if (result.Item) {
            return { statusCode: 200, body: JSON.stringify(result.Item) };
        } else {
            return { statusCode: 404, body: JSON.stringify({ message: 'Table not found' }) };
        }
    } catch (error) {
        console.error('Error getting table:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error getting table', error: error.message }) };
    }
}

async function createReservation(body, headers) {
    if (!verifyToken(headers)) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const reservationItem = {
        id: uuid.v4(),
        tableNumber: body.tableNumber,
        clientName: body.clientName,
        phoneNumber: body.phoneNumber,
        date: body.date,
        slotTimeStart: body.slotTimeStart,
        slotTimeEnd: body.slotTimeEnd
    };

    try {
        await dynamodb.put({ TableName: RESERVATIONS_TABLE, Item: reservationItem }).promise();
        return { statusCode: 200, body: JSON.stringify({ reservationId: reservationItem.id }) };
    } catch (error) {
        console.error('Error creating reservation:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error creating reservation', error: error.message }) };
    }
}

async function getReservations(headers) {
    if (!verifyToken(headers)) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    try {
        const result = await dynamodb.scan({ TableName: RESERVATIONS_TABLE }).promise();
        return { statusCode: 200, body: JSON.stringify({ reservations: result.Items }) };
    } catch (error) {
        console.error('Error getting reservations:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Error getting reservations', error: error.message }) };
    }
}

function verifyToken(headers) {
    const token = headers.Authorization;
    if (!token) {
        console.error('No token provided');
        return false;
    }
    // In a real application, you would verify the token here
    return true;
}

function isValidEmail(email) {
    const emailRegex = /(.+)@(.+){2,}\.(.+){2,}/;
    return emailRegex.test(email);
}

function isValidPassword(password) {
    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[$%^*\-_])[A-Za-z\d$%^*\-_]{12,}$/;
    return passwordRegex.test(password);
}