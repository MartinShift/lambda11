// app/lambdas/SignupLambda/index.js

const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();

exports.handler = async (event) => {
  const { firstName, lastName, email, password } = JSON.parse(event.body);

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: 'given_name', Value: firstName },
      { Name: 'family_name', Value: lastName },
      { Name: 'email', Value: email }
    ]
  };

  try {
    await cognito.signUp(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'User registered successfully' })
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};