// app/lambdas/CreateTableLambda/index.js

const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const { id, number, places, isVip, minOrder } = JSON.parse(event.body);

  const params = {
    TableName: process.env.TABLES_TABLE_NAME,
    Item: {
      id: id,
      number: number,
      places: places,
      isVip: isVip,
      minOrder: minOrder || null
    }
  };

  try {
    await dynamoDB.put(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ id: id })
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message })
    };
  }
};