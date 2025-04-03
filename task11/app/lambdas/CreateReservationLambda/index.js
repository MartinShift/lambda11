// app/lambdas/CreateReservationLambda/index.js

const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  const { tableNumber, clientName, phoneNumber, date, slotTimeStart, slotTimeEnd } = JSON.parse(event.body);

  // Validate input
  if (!tableNumber || !clientName || !phoneNumber || !date || !slotTimeStart || !slotTimeEnd) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required fields" })
    };
  }

  // Validate date format (yyyy-MM-dd)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid date format. Use yyyy-MM-dd" })
    };
  }

  // Validate time format (HH:MM)
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(slotTimeStart) || !timeRegex.test(slotTimeEnd)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid time format. Use HH:MM" })
    };
  }

  const reservationId = uuidv4();

  const params = {
    TableName: process.env.RESERVATIONS_TABLE_NAME,
    Item: {
      reservationId: reservationId,
      tableNumber: tableNumber,
      clientName: clientName,
      phoneNumber: phoneNumber,
      date: date,
      slotTimeStart: slotTimeStart,
      slotTimeEnd: slotTimeEnd
    },
    ConditionExpression: "attribute_not_exists(reservationId)"
  };

  try {
    // Check if the table exists
    const tableParams = {
      TableName: process.env.TABLES_TABLE_NAME,
      Key: {
        number: tableNumber
      }
    };
    const tableResult = await dynamoDB.get(tableParams).promise();
    if (!tableResult.Item) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Table does not exist" })
      };
    }

    // Check for conflicting reservations
    const conflictParams = {
      TableName: process.env.RESERVATIONS_TABLE_NAME,
      FilterExpression: "tableNumber = :tn AND #date = :d AND ((slotTimeStart <= :start AND slotTimeEnd > :start) OR (slotTimeStart < :end AND slotTimeEnd >= :end))",
      ExpressionAttributeNames: {
        "#date": "date"
      },
      ExpressionAttributeValues: {
        ":tn": tableNumber,
        ":d": date,
        ":start": slotTimeStart,
        ":end": slotTimeEnd
      }
    };
    const conflictResult = await dynamoDB.scan(conflictParams).promise();
    if (conflictResult.Items.length > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Conflicting reservation exists" })
      };
    }

    // Create the reservation
    await dynamoDB.put(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ reservationId: reservationId })
    };
  } catch (error) {
    console.error("Error creating reservation:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Could not create reservation" })
    };
  }
};