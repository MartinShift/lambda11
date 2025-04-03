const AWS = require('aws-sdk');
const uuid = require('uuid');

const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const TABLES_TABLE = process.env.TABLES_TABLE;
const RESERVATIONS_TABLE = process.env.RESERVATIONS_TABLE;

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event));
    console.log('Environment variables:', JSON.stringify({
        USER_POOL_ID,
        CLIENT_ID,
        TABLES_TABLE,
        RESERVATIONS_TABLE
    }));

    try {
        const route = `${event.resource} ${event.httpMethod}`;
        console.log('Route:', route);

        switch (route) {
            case '/signup POST':
                return await signup(JSON.parse(event.body));
            case '/signin POST':
                return await signin(JSON.parse(event.body));
            case '/tables GET':
                return await getTables(event.headers);
            case '/tables POST':
                return await createTable(JSON.parse(event.body), event.headers);
            case '/tables/{tableId} GET':
                return await getTable(event.pathParameters.tableId, event.headers);
            case '/reservations POST':
                return await createReservation(JSON.parse(event.body), event.headers);
            case '/reservations GET':
                return await getReservations(event.headers);
            default:
                console.log('Route not found:', route);
                return formatResponse(404, { message: 'Not Found' });
        }
    } catch (error) {
        console.error('Error:', error);
        return formatResponse(500, { message: 'Internal Server Error', error: error.message });
    }
};

async function signup(body) {
    console.log('Signup body:', JSON.stringify(body));
    const { firstName, lastName, email, password } = body;

    if (!isValidEmail(email)) {
        return formatResponse(400, { message: 'Invalid email format' });
    }

    if (!isValidPassword(password)) {
        return formatResponse(400, { message: 'Invalid password format' });
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
        await cognito.adminCreateUser(params).promise();
        
        await cognito.adminSetUserPassword({
            UserPoolId: USER_POOL_ID,
            Username: email,
            Password: password,
            Permanent: true
        }).promise();
        
        console.log('User created successfully');
        return formatResponse(200, { message: 'User created successfully' });
    } catch (error) {
        console.error('Error in signup:', error);
        return formatResponse(400, { message: 'Error in signup', error: error.message });
    }
}

async function signin(body) {
    console.log('Signin body:', JSON.stringify(body));
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
        console.log('Signin successful');
        return formatResponse(200, { idToken: result.AuthenticationResult.IdToken });
    } catch (error) {
        console.error('Error in signin:', error);
        return formatResponse(400, { message: 'Error in signin', error: error.message });
    }
}

async function getTables(headers) {
    console.log('Getting tables');
    if (!verifyToken(headers)) {
        return formatResponse(401, { message: 'Unauthorized' });
    }
    
    try {
        const result = await dynamodb.scan({ TableName: TABLES_TABLE }).promise();
        console.log('Tables retrieved:', JSON.stringify(result.Items));
        return formatResponse(200, { tables: result.Items });
    } catch (error) {
        console.error('Error getting tables:', error);
        return formatResponse(500, { message: 'Error getting tables', error: error.message });
    }
}

async function createTable(body, headers) {
    console.log('Creating table:', JSON.stringify(body));
    if (!verifyToken(headers)) {
        return formatResponse(401, { message: 'Unauthorized' });
    }
    
    const params = {
        TableName: TABLES_TABLE,
        Item: {
            id: body.id,
            number: body.number,
            places: body.places,
            isVip: body.isVip,
            minOrder: body.minOrder || 0
        }
    };
    
    try {
        await dynamodb.put(params).promise();
        console.log('Table created successfully');
        return formatResponse(200, { id: body.id });
    } catch (error) {
        console.error('Error creating table:', error);
        return formatResponse(500, { message: 'Error creating table', error: error.message });
    }
}

async function getTable(tableId, headers) {
    console.log('Getting table:', tableId);
    if (!verifyToken(headers)) {
        return formatResponse(401, { message: 'Unauthorized' });
    }
    
    const params = {
        TableName: TABLES_TABLE,
        Key: { id: parseInt(tableId) }
    };
    
    try {
        const result = await dynamodb.get(params).promise();
        console.log('Table retrieved:', JSON.stringify(result.Item));
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
    console.log('Creating reservation:', JSON.stringify(body));
    if (!verifyToken(headers)) {
        return formatResponse(401, { message: 'Unauthorized' });
    }
    
    const reservationId = uuid.v4();
    const params = {
        TableName: RESERVATIONS_TABLE,
        Item: { 
            reservationId,
            tableNumber: body.tableNumber,
            clientName: body.clientName,
            phoneNumber: body.phoneNumber,
            date: body.date,
            slotTimeStart: body.slotTimeStart,
            slotTimeEnd: body.slotTimeEnd
        }
    };
    
    try {
        await dynamodb.put(params).promise();
        console.log('Reservation created successfully');
        return formatResponse(200, { reservationId });
    } catch (error) {
        console.error('Error creating reservation:', error);
        return formatResponse(500, { message: 'Error creating reservation', error: error.message });
    }
}

async function getReservations(headers) {
    console.log('Getting reservations');
    if (!verifyToken(headers)) {
        return formatResponse(401, { message: 'Unauthorized' });
    }
    
    try {
        const result = await dynamodb.scan({ TableName: RESERVATIONS_TABLE }).promise();
        console.log('Reservations retrieved:', JSON.stringify(result.Items));
        return formatResponse(200, { reservations: result.Items });
    } catch (error) {
        console.error('Error getting reservations:', error);
        return formatResponse(500, { message: 'Error getting reservations', error: error.message });
    }
}

function verifyToken(headers) {
    console.log('Verifying token');
    const token = headers.Authorization;
    if (!token) {
        console.error('No token provided');
        return false;
    }
    // In a real application, you would verify the token here
    // For now, we'll just check if it exists
    console.log('Token verified');
    return true;
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidPassword(password) {
    // At least 12 characters long, contains alphanumeric and special characters
    const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[$%^*\-_])[A-Za-z\d$%^*\-_]{12,}$/;
    return passwordRegex.test(password);
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