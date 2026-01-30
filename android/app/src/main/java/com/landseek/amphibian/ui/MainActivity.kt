package com.landseek.amphibian.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.landseek.amphibian.service.AmphibianCoreService
import android.content.Intent

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Auto-start the Brain Service
        startForegroundService(Intent(this, AmphibianCoreService::class.java))

        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                AmphibianApp()
            }
        }
    }
}

@Composable
fun AmphibianApp() {
    var input by remember { mutableStateOf("") }
    val messages = remember { mutableStateListOf<Message>() }

    // Mock initial message
    LaunchedEffect(Unit) {
        messages.add(Message("Amphibian Agent", "Core systems online. Node.js bridge active. 🐸", true))
    }

    Column(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        // Header
        SmallTopAppBar(
            title = { Text("Landseek Amphibian") },
            colors = TopAppBarDefaults.smallTopAppBarColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        )

        // Chat List
        LazyColumn(
            modifier = Modifier.weight(1f).padding(8.dp),
            reverseLayout = true
        ) {
            items(messages.asReversed()) { msg ->
                ChatBubble(msg)
            }
        }

        // Input Area
        Row(
            modifier = Modifier.fillMaxWidth().padding(8.dp).navigationBarsPadding(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Command the Agent...") },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = {
                    if (input.isNotBlank()) {
                        messages.add(Message("You", input, false))
                        // TODO: Send to Service via Bridge
                        input = ""
                    }
                })
            )
            Button(onClick = {
                if (input.isNotBlank()) {
                    messages.add(Message("You", input, false))
                    // TODO: Send to Service via Bridge
                    input = ""
                }
            }) {
                Text("Send")
            }
        }
    }
}

@Composable
fun ChatBubble(message: Message) {
    val align = if (message.isAgent) Arrangement.Start else Arrangement.End
    val color = if (message.isAgent) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.primaryContainer

    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = align) {
        Card(
            colors = CardDefaults.cardColors(containerColor = color),
            modifier = Modifier.widthIn(max = 300.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = message.sender,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = message.content,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}

data class Message(val sender: String, val content: String, val isAgent: Boolean)
