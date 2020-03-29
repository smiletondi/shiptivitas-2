import Database from 'better-sqlite3';
import express from 'express';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  return res.status(200).send({
    'message': 'SHIPTIVITY API. Read documentation to see API docs'
  });
});

// We are keeping one connection alive for the rest of the life application for simplicity
const db = new Database('./clients.db');

// Don't forget to close connection when server gets terminated
const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

/**
 * Validate id input
 * @param {any} id
 */
const validateId = (id) => {
  if (Number.isNaN(id)) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid id provided.',
        'long_message': 'Id can only be integer.',
      },
    };
  }
  const client = db.prepare('select * from clients where id = ? limit 1').get(id);
  if (!client) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid id provided.',
        'long_message': 'Cannot find client with that id.',
      },
    };
  }
  return {
    valid: true,
  };
}

/**
 * Validate priority input
 * @param {any} priority
 */
const validatePriority = (priority) => {
  if (Number.isNaN(priority)) {
    return {
      valid: false,
      messageObj: {
        'message': 'Invalid priority provided.',
        'long_message': 'Priority can only be positive integer.',
      },
    };
  }
  return {
    valid: true,
  }
}

/**
 * Get all of the clients. Optional filter 'status'
 * GET /api/v1/clients?status={status} - list all clients, optional parameter status: 'backlog' | 'in-progress' | 'complete'
 */
app.get('/api/v1/clients', (req, res) => {
  const status = req.query.status;
  if (status) {
    // status can only be either 'backlog' | 'in-progress' | 'complete'
    if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
    const clients = db.prepare('select * from clients where status = ?').all(status);
    return res.status(200).send(clients);
  }
  const statement = db.prepare('select * from clients');
  const clients = statement.all();
  return res.status(200).send(clients);
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id} - get client by id
 */
app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const {
    valid,
    messageObj
  } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }
  return res.status(200).send(db.prepare('select * from clients where id = ?').get(id));
});

/**
 * Update client information based on the parameters provided.
 * When status is provided, the client status will be changed
 * When priority is provided, the client priority will be changed with the rest of the clients accordingly
 * Note that priority = 1 means it has the highest priority (should be on top of the swimlane).
 * No client on the same status should not have the same priority.
 * This API should return list of clients on success
 *
 * PUT /api/v1/clients/{client_id} - change the status of a client
 *    Data:
 *      status (optional): 'backlog' | 'in-progress' | 'complete',
 *      priority (optional): integer,
 *
 */
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const {
    valid,
    messageObj
  } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }

  let {
    status,
    priority
  } = req.body;
  let clients = db.prepare('select * from clients').all();
  const client = clients.find(client => client.id === id);

  /* ---------- Update code below ----------*/
  if (priority) {
    const cli = db.prepare('select * from clients where status = ? and priority = ? limit 1').get([status, priority]);

    if (!cli) { //priority doesn't exist yet
      const stmt = db.prepare('update clients set priority = ? where id = ?')
      stmt.run([priority, client.id])
    } else if (status === client.status) { //same swimlane
      if (priority < client.priority) {
        const increment = db.prepare('update clients set priority = priority + 1 where priority >= ? and priority < ?')
        increment.run([priority, client.priority, ])
      } else if (priority > client.priority) {
        const decrement = db.prepare('update clients set priority = priority - 1 where priority <= ? and priority > ?')
        decrement.run([priority, client.priority])
      }
      const stmt = db.prepare('update clients set priority = ? where id = ?')
      stmt.run([priority, client.id])

    } else { //moving to different swimlane
      //take sibling priority and increment all above
      const increment = db.prepare('update clients set priority = priority + 1 where priority >= ? and status = ?')
      increment.run([priority, status])

      //decrement all priorities above client.priority
      const decrement = db.prepare('update clients set priority = priority - 1 where priority > ? and status = ?')
      decrement.run([client.priority, client.status])

      const takeSib = db.prepare('update clients set priority = ? where id = ?')
      takeSib.run([priority, client.id])
    }
  } else {
    const max = db.prepare('select * from clients where priority= 1 + (select max(priority) from clients where status = ?)').get([status])
    const setMax = db.prepare('update clients set priority = ? where id = ?')

    //decrement all priorities above client.priority
    const decrement = db.prepare('update clients set priority = priority - 1 where priority > ? and status = ?')
    decrement.run([client.priority, client.status])

    if (max) {
      setMax.run([max.priority, client.id])
    } else {
      setMax.run([1, client.id])
    }
  }

  if (status) {
    const stmt = db.prepare('update clients set status = ? where id = ?')
    stmt.run([status, client.id])
  }

  // End


  return res.status(200).send(clients);
});

app.listen(3001);
console.log('app running on port ', 3001);