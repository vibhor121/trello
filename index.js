const express = require("express");
const jwt = require('jsonwebtoken');
const { authenticate } = require("./auth");
const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

app.use(express.json());

// In-memory data storage (temporary)
let users = [];
let organizations = [];
let boards = [];
let issues = [];

// CREATE
app.post("/signup",(request,res)=>{
    const email = request.body.email;
    const password = request.body.password;
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: "User already exists" });
    }
    const user = { id: users.length + 1, email, password, organization: null };
    users.push(user);
    res.json({ message: "User created" });
});

app.post("/signin", (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ token });
});

app.post("/organization", authenticate, (req, res) => {
    const { name, title } = req.body;
    const creatorId = req.userId;
    const creator = users.find(u => u.id === creatorId);
    if (!creator) {
        return res.status(404).json({ error: "Creator not found" });
    }
    if (creator.organization) {
        return res.status(400).json({ error: "User is already part of an organization" });
    }
    const org = { id: organizations.length + 1, name, title, members: [creatorId], boards: [] };
    organizations.push(org);
    creator.organization = org.id;
    res.json({ org });
});

app.get("/organization", authenticate, (req, res) => {
    const { orgId } = req.query;
    const userId = req.userId;
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }
    if (orgId) {
        if (user.organization != orgId) {
            return res.status(403).json({ error: "Not authorized" });
        }
        const org = organizations.find(o => o.id == orgId);
        if (!org) {
            return res.status(404).json({ error: "Organization not found" });
        }
        const populatedOrg = {
            ...org,
            members: org.members.map(id => {
                const member = users.find(u => u.id === id);
                return member ? { id: member.id, email: member.email, organization: member.organization } : null;
            }).filter(Boolean)
        };
        res.json({ organization: populatedOrg });
    } else {
        if (!user.organization) {
            return res.json({ organizations: [] });
        }
        const org = organizations.find(o => o.id === user.organization);
        if (!org) {
            return res.status(404).json({ error: "Organization not found" });
        }
        const populatedOrg = {
            ...org,
            members: org.members.map(id => {
                const member = users.find(u => u.id === id);
                return member ? { id: member.id, email: member.email, organization: member.organization } : null;
            }).filter(Boolean)
        };
        res.json({ organizations: [populatedOrg] });
    }
});

app.post("/add-member-to-organization", authenticate, (req, res) => {
    const { orgId, email } = req.body;
    const adderId = req.userId;
    const org = organizations.find(o => o.id === orgId);
    if (!org) {
        return res.status(404).json({ error: "Organization not found" });
    }
    if (!org.members.includes(adderId)) {
        return res.status(403).json({ error: "Not authorized to add members" });
    }
    const member = users.find(u => u.email === email);
    if (!member) {
        return res.status(404).json({ error: "Member not found" });
    }
    if (member.organization) {
        return res.status(400).json({ error: "User is already part of an organization" });
    }
    if (!org.members.includes(member.id)) {
        org.members.push(member.id);
        member.organization = orgId;
    }
    res.json({ org });
});

app.post("/board", authenticate, (req, res) => {
    const { name, orgId } = req.body;
    const creatorId = req.userId;
    const org = organizations.find(o => o.id === orgId);
    if (!org || !org.members.includes(creatorId)) {
        return res.status(403).json({ error: "Not authorized" });
    }
    const board = { id: boards.length + 1, name, orgId, issues: [] };
    boards.push(board);
    org.boards.push(board.id);
    res.json({ board });
});

app.post("/issue", authenticate, (req, res) => {
    const { title, description, boardId } = req.body;
    const creatorId = req.userId;
    const board = boards.find(b => b.id === boardId);
    if (!board) {
        return res.status(404).json({ error: "Board not found" });
    }
    const org = organizations.find(o => o.boards.includes(boardId));
    if (!org || !org.members.includes(creatorId)) {
        return res.status(403).json({ error: "Not authorized" });
    }
    const issue = { id: issues.length + 1, title, description, boardId, status: 'todo' };
    issues.push(issue);
    board.issues.push(issue.id);
    res.json({ issue });
});

// READ
app.get("/boards", authenticate, (req, res) => {
    const userId = req.userId;
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }
    const userBoards = boards.filter(b => b.orgId === user.organization);
    res.json({ boards: userBoards });
});

app.get("/issues", authenticate, (req, res) => {
    const { boardId } = req.query;
    const userId = req.userId;
    const board = boards.find(b => b.id == boardId);
    if (!board) {
        return res.status(404).json({ error: "Board not found" });
    }
    if (board.orgId !== user.organization) {
        return res.status(403).json({ error: "Not authorized" });
    }
    const boardIssues = issues.filter(i => i.boardId == boardId);
    res.json({ issues: boardIssues });
});

app.get("/members", authenticate, (req, res) => {
    const { orgId } = req.query;
    const userId = req.userId;
    if (user.organization != orgId) {
        return res.status(403).json({ error: "Not authorized" });
    }
    const org = organizations.find(o => o.id == orgId);
    if (!org) {
        return res.status(404).json({ error: "Organization not found" });
    }
    const members = users.filter(u => org.members.includes(u.id));
    res.json({ members });
});

// UPDATE
app.put("/issues", authenticate, (req, res) => {
    const { issueId, updates } = req.body;
    const userId = req.userId;
    const issue = issues.find(i => i.id == issueId);
    if (!issue) {
        return res.status(404).json({ error: "Issue not found" });
    }
    const board = boards.find(b => b.id === issue.boardId);
    if (board.orgId !== user.organization) {
        return res.status(403).json({ error: "Not authorized" });
    }
    Object.assign(issue, updates);
    res.json({ issue });
});

// DELETE
app.delete("/members", authenticate, (req, res) => {
    const { orgId, memberId } = req.body;
    const removerId = req.userId;
    const user = users.find(u => u.id === removerId);
    if (!user || user.organization != orgId) {
        return res.status(403).json({ error: "Not authorized" });
    }
    const org = organizations.find(o => o.id == orgId);
    if (!org) {
        return res.status(404).json({ error: "Organization not found" });
    }
    org.members = org.members.filter(id => id !== memberId);
    const member = users.find(u => u.id === memberId);
    if (member) {
        member.organization = null;
    }
    res.json({ message: "Member removed" });
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});