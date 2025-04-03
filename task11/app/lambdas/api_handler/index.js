const { 
    CognitoIdentityProviderClient, 
    AdminCreateUserCommand, 
    AdminSetUserPasswordCommand, 
    InitiateAuthCommand,
    AdminGetUserCommand
} = require("@aws-sdk/client-cognito-identity-provider");
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
    console.log('Signup body:', JSON.stringify(body));
    const { firstName, lastName, email, password } = body;

    if (!firstName || !lastName) {
        return formatResponse(400, { message: 'First name and last name are required' });
    }

    if (!isValidEmail(email)) {
        return formatResponse(400, { message: 'Invalid email format' });
    }

    if (!isValidPassword(password)) {
        return formatResponse(400, { message: 'Invalid password format. Password must be at least 12 characters long and include alphanumeric characters and any of "$%^*-_"' });
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
        // Check if user already exists
        try {
            await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: email }));
            // If the above doesn't throw an error, the user already exists
            return formatResponse(400, { message: 'An account with this email already exists' });
        } catch (error) {
            // If UserNotFoundException is thrown, the user doesn't exist, so we can create it
            if (error.name !== 'UserNotFoundException') {
                throw error; // Re-throw if it's a different error
            }
        }

        // Create the user
        await cognito.send(new AdminCreateUserCommand(params));
        
        // Set the user's password
        await cognito.send(new AdminSetUserPasswordCommand({
            UserPoolId: USER_POOL_ID,
            Username: email,
            Password: password,
            Permanent: true
        }));
        
        console.log('User created successfully');
        return formatResponse(200, { message: 'User created successfully' });
    } catch (error) {
        console.error('Error in signup:', error);
        return formatResponse(500, { message: 'Error in signup', error: error.message });
    }
}

function formatResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify(body)
    };
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
        const command = new InitiateAuthCommand(params);
        const result = await cognito.send(command);
        return formatResponse(200, { idToken: result.AuthenticationResult.IdToken });
    } catch (error) {
        console.error('Error in signin:', error);
        return formatResponse(400, { message: 'Error in signin', error: error.message });
    }
}

async function getTables(headers) {
    if (!verifyToken(headers)) {
        return formatResponse(401, { message: 'Unauthorized' });
    }

    try {
        const command = new ScanCommand({ TableName: TABLES_TABLE });
        const result = await dynamodb.send(command);
        return formatResponse(200, { tables: result.Items });
    } catch (error) {
        console.error('Error getting tables:', error);
        return formatResponse(500, { message: 'Error getting tables', error: error.message });
    }
}

async function createTable(body, headers) {
    if (!verifyToken(headers)) {
        return formatResponse(401, { message: 'Unauthorized' });
    }

    try {
        const id = body.id || await getNextId(TABLES_TABLE);
        const tableItem = {
            id: id,
            number: body.number,
            places: body.places,
            isVip: body.isVip,
            minOrder: body.minOrder || 0
        };

        const command = new PutCommand({ TableName: TABLES_TABLE, Item: tableItem });
        await dynamodb.send(command);
        return formatResponse(200, { id: id });
    } catch (error) {
        console.error('Error creating table:', error);
        return formatResponse(500, { message: 'Error creating table', error: error.message });
    }
}

async function getNextId(tableName) {
    const command = new ScanCommand({
        TableName: tableName,
        ProjectionExpression: "id"
    });
    const result = await dynamodb.send(command);
    const ids = result.Items.map(item => Number(item.id)).filter(id => !isNaN(id));
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

async function getTable(tableId, headers) {
    if (!verifyToken(headers)) {
        return formatResponse(401, { message: 'Unauthorized' });
    }

    try {
        const command = new GetCommand({ TableName: TABLES_TABLE, Key: { id: tableId } });
        const result = await dynamodb.send(command);
        if (result.Item) {
            return formatResponse(200, result.Item);
        } else {
            return formatResponse(404, { message: 'Table not found' });
        }
    } catch (error) {
        console.error('Error getting table:', error);
        return formatResponse(500, { message: 'Error getting table', error: error.message });
    }
}

async function createReservation(body, headers) {
    if (!verifyToken(headers)) {
        return formatResponse(401, { message: 'Unauthorized' });
    }

    const reservationItem = {
        id: uuidv4(),
        tableNumber: body.tableNumber,
        clientName: body.clientName,
        phoneNumber: body.phoneNumber,
        date: body.date,
        slotTimeStart: body.slotTimeStart,
        slotTimeEnd: body.slotTimeEnd
    };

    try {
        const command = new PutCommand({ TableName: RESERVATIONS_TABLE, Item: reservationItem });
        await dynamodb.send(command);
        return formatResponse(200, { reservationId: reservationItem.id });
    } catch (error) {
        console.error('Error creating reservation:', error);
        return formatResponse(500, { message: 'Error creating reservation', error: error.message });
    }
}

async function getReservations(headers) {
    if (!verifyToken(headers)) {
        return formatResponse(401, { message: 'Unauthorized' });
    }

    try {
        const command = new ScanCommand({ TableName: RESERVATIONS_TABLE });
        const result = await dynamodb.send(command);
        return formatResponse(200, { reservations: result.Items });
    } catch (error) {
        console.error('Error getting reservations:', error);
        return formatResponse(500, { message: 'Error getting reservations', error: error.message });
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
    // Simple check for the presence of @ and .
    return email.includes('@') && email.includes('.');
}

function isValidPassword(password) {
    // At least 12 characters long, contains alphanumeric and any of "$%^*-_"
    return password.length >= 12 && 
           /[a-zA-Z]/.test(password) && 
           /\d/.test(password) && 
           /[$%^*\-_]/.test(password);
}