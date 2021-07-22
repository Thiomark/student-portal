import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-my-modules',
  templateUrl: './my-modules.component.html',
  styleUrls: ['./my-modules.component.scss']
})
export class MyModulesComponent implements OnInit {

  myModules: string [] = [
    'IT Project Management',
    'Database (Intermediate)',
    'Programming 2B',
    'System Analysis and Design',
    'Programming 2A',
    'Human Computer Interaction',
    'Database (Introduction)',
    'Web Development (Introduction)',
    'Work Integrated Learning 2'
  ]

  constructor() { }

  ngOnInit(): void {
  }

}
