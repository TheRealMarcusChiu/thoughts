---
date: 2026-01-24T00:00:00-00:00
draft: false
title: "Coding AI Coding Agent"
---

AI/LLM is not just for answering questions or generating text - it can also be a powerful **coding assistant**, capable of reading files, running commands, editing code, and even searching codebases. In this post, we explore the evolution of a **coding AI agent** using the Anthropic Claude API, showing six stages of building a progressively smarter coding assistant.

# 1. Basic Conversational Agent

We start with a simple conversational AI that interacts with the user using Claude.

```python
import anthropic
import os


API_KEY = os.environ.get("ANTHROPIC_API_KEY")
CLAUDE_MODEL = "claude-sonnet-4-20250514"


def main():
    client = anthropic.Anthropic(api_key=API_KEY)
    conversation_history = []

    while True:
        user_input = input("You: ").strip()
        conversation_history.append({"role": "user", "content": user_input})

        response = client.messages.create(model=CLAUDE_MODEL, max_tokens=1024, messages=conversation_history) 
        conversation_history.append({"role": "assistant", "content": response.content})
        print(f"\nClaude: {response.content[0].text}\n")


if __name__ == "__main__":
    main()
```

This simple version can carry on a conversation, but it cannot interact with your local environment or files.

# 2. Adding File Reading Tools

Next, we give Claude the ability to **read files** from your system.

```python {.numberLines hl_lines="2 4 9-44 57-72"}
import anthropic
import json
import os
from pathlib import Path


API_KEY = os.environ.get("ANTHROPIC_API_KEY")
CLAUDE_MODEL = "claude-sonnet-4-20250514"
TOOLS = [
    {
        "name": "read_file",
        "description": "Read the contents of a file",
        "input_schema": {
            "type": "object",
            "properties": {
                "filepath": {
                    "type": "string",
                    "description": "Path to the file to read"
                }
            },
            "required": ["filepath"]
        }
    },
]


def tool_read_file(filepath):
    """Read contents of a file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return {"success": True, "content": f.read()}
    except Exception as e:
        return {"success": False, "error": str(e)}

def execute_tool(tool_name, arguments):
    """Execute a tool function with given arguments"""
    tools_map = {
        "read_file": tool_read_file
    }
    
    if tool_name in tools_map:
        return tools_map[tool_name](**arguments)
    else:
        return {"success": False, "error": f"Unknown tool: {tool_name}"}


def main():
    client = anthropic.Anthropic(api_key=API_KEY)
    conversation_history = []

    while True:
        user_input = input("You: ").strip()
        conversation_history.append({"role": "user", "content": user_input})

        response = client.messages.create(model=CLAUDE_MODEL, max_tokens=4096, tools=TOOLS, messages=conversation_history)

        # TOOLS START - execute tools if any
        while response.stop_reason == "tool_use":
            conversation_history.append({"role": "assistant", "content": response.content})
            print("\nClaude (Using tools):")
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    tool_name = block.name
                    tool_input = block.input
                    print(f"[Calling {tool_name} with {tool_input}]")
                    tool_result = execute_tool(tool_name, tool_input)
                    tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(tool_result)})
            conversation_history.append({"role": "user", "content": tool_results})
            # send TOOL results back to Claude and get new response
            response = client.messages.create(model=CLAUDE_MODEL, max_tokens=4096, tools=TOOLS, messages=conversation_history)
        # TOOLS END

        conversation_history.append({"role": "assistant", "content": response.content})
        print(f"\nClaude: {response.content[0].text}\n")


if __name__ == "__main__":
    main()
```

Now the agent can **read file contents** and use that data in its responses.

# 3. Listing Files in Directories

We expand the AI's abilities with a **directory listing tool**, so Claude can inspect your filesystem.

```python
...

TOOLS = [
    {
        "name": "read_file",
        "description": "Read the contents of a file",
        "input_schema": {
            "type": "object",
            "properties": {
                "filepath": {
                    "type": "string",
                    "description": "Path to the file to read"
                }
            },
            "required": ["filepath"]
        }
    },
    {
        "name": "list_files",
        "description": "List files and directories in a given path",
        "input_schema": {
            "type": "object",
            "properties": {
                "directory": {
                    "type": "string",
                    "description": "Directory path to list (default: current directory)"
                }
            },
            "required": []
        }
    },
]

...

def tool_list_files(directory="."):
    """List files in a directory"""
    try:
        path = Path(directory)
        files = []
        for item in path.iterdir():
            files.append({
                "name": item.name,
                "type": "directory" if item.is_dir() else "file",
                "path": str(item)
            })
        return {"success": True, "files": files}
    except Exception as e:
        return {"success": False, "error": str(e)}

...

def execute_tool(tool_name, arguments):
    """Execute a tool function with given arguments"""
    tools_map = {
        "read_file": tool_read_file,
        "list_files": tool_list_files
    }
    ...
```

With this addition, Claude can now **see which files exist** in a directory and respond based on that information.

# 4. Executing Bash Commands

To make our agent more powerful, we add a tool to **execute Bash commands**.

```python
import subprocess

...

    {
        "name": "execute_bash",
        "description": "Execute a bash command and return the output",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The bash command to execute"
                }
            },
            "required": ["command"]
        }
    },

...

def tool_execute_bash(command):
    """Execute a bash command"""
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30
        )
        return {
            "success": True,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Command timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}

...

def execute_tool(tool_name, arguments):
    """Execute a tool function with given arguments"""
    tools_map = {
        "read_file": tool_read_file,
        "list_files": tool_list_files,
        "execute_bash": tool_execute_bash,
    }
    ...
```

Now Claude can **run commands on your machine**, such as compiling code, checking Git status, or inspecting logs.

# 5. Editing Files

The agent becomes a full coding assistant by allowing it to **write or edit files**.

```python

...

   {
        "name": "edit_file",
        "description": "Write or edit a file with new content",
        "input_schema": {
            "type": "object",
            "properties": {
                "filepath": {
                    "type": "string",
                    "description": "Path to the file to write"
                },
                "content": {
                    "type": "string",
                    "description": "Content to write to the file"
                }
            },
            "required": ["filepath", "content"]
        }
    },

...

def tool_edit_file(filepath, content):
    """Write/edit a file with new content"""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return {"success": True, "message": f"File {filepath} written successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}

...

def execute_tool(tool_name, arguments):
    """Execute a tool function with given arguments"""
    tools_map = {
        "read_file": tool_read_file,
        "list_files": tool_list_files,
        "execute_bash": tool_execute_bash,
        "edit_file": tool_edit_file,
    }
    ...
```

This enables Claude to **modify code or configuration files directly**, turning it into an active coding partner.

# 6. Searching Codebases with Ripgrep

Finally, we add a tool for **searching code patterns** using `ripgrep`.

```python
...

    {
        "name": "ripgrep_search",
        "description": "Search for code patterns using ripgrep",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Search pattern (regex supported)"
                },
                "path": {
                    "type": "string",
                    "description": "Path to search in (default: current directory)"
                },
                "options": {
                    "type": "string",
                    "description": "Additional ripgrep options (e.g., '-i' for case-insensitive)"
                }
            },
            "required": ["pattern"]
        }
    }

...

def tool_ripgrep_search(pattern, path=".", options=""):
    """Search code using ripgrep"""
    try:
        command = f"rg {options} '{pattern}' {path}"
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30
        )
        return {
            "success": True,
            "matches": result.stdout,
            "stderr": result.stderr
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Search timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}

...

def execute_tool(tool_name, arguments):
    """Execute a tool function with given arguments"""
    tools_map = {
        "read_file": tool_read_file,
        "list_files": tool_list_files,
        "execute_bash": tool_execute_bash,
        "edit_file": tool_edit_file,
        "ripgrep_search": tool_ripgrep_search,
    }
    ...
```

With this feature, Claude can **search through large codebases** efficiently, making it a versatile AI coding agent.

# Conclusion

By progressively adding tools—file reading, listing, executing commands, editing, and searching—we can build a fully functional AI assistant capable of **coding, exploring, and interacting with projects**. Each stage adds more autonomy and practical utility for real-world development workflows.
